import type { SpawnSlot } from '@s2u/scene';
import type { MenuItem } from '../padMenu';
import { builtPanel, forgeEl, revealRow, type ForgePanel } from '../shell/panel';
import { MAP_DATA_KIND_TOGGLES } from '../mapDataBillboards';

/** A disc spawn slot as the Outliner's Spawn Slots branch lists it. */
export interface SpawnSlotRow {
  /** `A1`..`B24`: the side's letter and the slot's place among its side's, from 1. */
  key: string;
  label: string;
  /** Its place in whole units and its facing in degrees. */
  detail: string;
  title: string;
  at: [number, number, number];
}

/**
 * The map's own spawn slots (`LoadedMap.slots`: `AIMAPS.MPS`'s spawn list, research 75 §5.5-§7), one row each, read only
 * (a browser adaptation, FG.R2): side A's (0) then side B's (1), each in the file's order, named by side and place from 1;
 * the facing is the record's eighth turns from -z toward +x (75 §7, §11).
 */
export function spawnSlotRows(slots: readonly SpawnSlot[]): SpawnSlotRow[] {
  return [...slots].sort((a, b) => a.side - b.side || a.index - b.index).map((s) => {
    const key = `${s.side === 0 ? 'A' : 'B'}${s.index + 1}`;
    const [x, y, z] = s.position;
    const where = `${Math.round(x)}, ${Math.round(y)}, ${Math.round(z)}`;
    return {
      key, label: `Slot ${key}`, detail: `${where} · ${(s.step % 8) * 45}°`, at: [x, y, z],
      title: `Disc spawn slot ${key} (side ${s.side === 0 ? 'A' : 'B'}) at ${where}, facing ${(s.step % 8) * 45}°, ${s.onFloor ? 'on the floor under its cell' : "at its cell's own height"}`
        + ' · read only · click to look at it',
    };
  });
}

/**
 * FUI-1 (a browser adaptation, FG.R2): the Outliner, above the Inspector. Its markup is the page's as it was
 * (`.fx-outliner-tools` with its search and type filter, `ul.fx-outliner`); the page's closure keeps drawing its rows.
 */
export interface OutlinerDom {
  body: HTMLDivElement;
  list: HTMLUListElement;
  search: HTMLInputElement;
  /** The Filter dropdown (`filterList` its switches, the page's to fill: `OUTLINER_KINDS`). */
  filter: HTMLDetailsElement;
  filterSummary: HTMLElement;
  filterList: HTMLDivElement;
}

/**
 * The Outliner's kinds (the owner, 2026-11-10: "a filter for all the object types ... toggle each one independently and
 * solo", as the View dropdown's): every kind as the View names it (`MAP_DATA_KIND_TOGGLES`: the map's own and the layout's
 * alike), then the layout's rules entities (FCW-32 step 4) and its missing pieces.
 */
export const OUTLINER_KINDS: readonly (readonly [string, string])[] = [
  ...MAP_DATA_KIND_TOGGLES.map((t) => [t.id, t.label] as const), ['rules', 'Rules'], ['missing', 'Missing pieces'],
];

export function buildOutliner(doc: Document): OutlinerDom {
  const list = forgeEl(doc, 'ul', 'fx-outliner');
  const tools = forgeEl(doc, 'div', 'fx-outliner-tools');
  const search = forgeEl(doc, 'input', 'fx-search');
  search.type = 'search';
  search.placeholder = 'Search placed…';
  search.setAttribute('aria-label', 'Search the outliner');
  // The Filter: a dropdown as the View's -- your objects, the map's, then a switch and a Solo each kind (`OUTLINER_KINDS`).
  const filter = forgeEl(doc, 'details', 'fx-viewport-modes fx-outliner-filter');
  const filterSummary = forgeEl(doc, 'summary', 'fx-viewport-modes-summary', 'Filter');
  filterSummary.title = 'Which objects the Outliner lists: yours, the map\u2019s, and each kind on or off (Solo: that kind alone)';
  const filterList = forgeEl(doc, 'div', 'fx-viewport-modes-list fx-outliner-filter-list');
  filter.append(filterSummary, filterList);
  tools.append(search, filter);
  const body = forgeEl(doc, 'div', 'fx-section');                    // FUI-22 (D2): the dock's one section style
  body.append(tools, list);
  return { body, list, search, filter, filterSummary, filterList };
}

/** Its pad path: a START row that shows it, with how many rows it lists. */
export function outlinerPanel(dom: OutlinerDom, reveal: (id: string) => void): ForgePanel {
  const menuSection = (): MenuItem[] => {
    const rows = dom.list.querySelectorAll('li:not(.fx-empty):not(.fx-tree-branch)').length;
    return [revealRow(reveal, 'outliner', 'Outliner', `${rows} listed`, 'What the layout places · ✕ shows it in the dock')];
  };
  return builtPanel({ id: 'outliner', title: 'Outliner', dock: 'right', order: 10, defaultOpen: true, tab: 'Object',
    padLegend: [{ button: 'cross', label: 'Show' }], menuSection }, dom.body);
}
