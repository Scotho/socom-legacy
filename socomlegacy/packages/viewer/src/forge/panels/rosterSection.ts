import type { Side } from '@s2u/scene';
import type { CharacterRoster } from '../layout';
import { ROSTER_SIDES, rosterColumns, setRosterColumn } from '../rosterSetting';
import { forgeEl } from '../shell/panel';

/**
 * The Map Settings panel's Characters section (a browser adaptation over `../rosterSetting`; the owner, 2026-11-10):
 * each side's ARMORY columns, each a disc map and one of that map's types on the side, the map's own until one is set.
 * A map's types are read when it is first named (`choicesOf` null meanwhile); the page draws again once they are.
 */
export interface RosterView {
  setting: CharacterRoster | null | undefined;
  /** The base map (a blank floor's: its library), whose own types the columns show until the layout names any. */
  home: string;
  homeCounts: Readonly<Record<Side, number>>;
  /** The disc's MP maps, stem and label. */
  maps: readonly (readonly [string, string])[];
  /** A map's types for a side; null while that map is being read. */
  choicesOf(stem: string, side: Side): { index: number; label: string }[] | null;
  locked: boolean;
  /** Bumped by the page whenever a map's types arrive, so the section draws them. */
  rev: number;
}

export interface RosterSection {
  body: HTMLElement;
  draw(view: RosterView): void;
  onChange(cb: (next: CharacterRoster | null) => void): void;
}

const SIDE_LABEL: Readonly<Record<Side, string>> = { seal: 'SEAL', terrorist: 'Terrorist' };
const NONE = '';

export function buildRosterSection(doc: Document): RosterSection {
  const body = forgeEl(doc, 'div', 'fx-roster');
  let listeners: ((next: CharacterRoster | null) => void)[] = [];
  let view: RosterView | null = null;
  const tell = (next: CharacterRoster | null): void => { for (const l of listeners) l(next); };
  const option = (value: string, label: string): HTMLOptionElement => { const o = forgeEl(doc, 'option', '', label); o.value = value; return o; };

  const draw = (v: RosterView): void => {
    if (view && v.setting === view.setting && v.home === view.home && v.locked === view.locked && v.rev === view.rev && v.maps === view.maps) return;
    view = v;
    body.replaceChildren(forgeEl(doc, 'h3', '', 'Characters'));
    const top = forgeEl(doc, 'div', 'fx-arsenal-presets');
    const reset = forgeEl(doc, 'button', 'fx-chip fx-setting-reset', 'Map’s own');
    reset.type = 'button';
    reset.title = 'The map’s own ARMORY characters, from the disc';
    reset.dataset['rosterReset'] = '';
    reset.disabled = v.locked || !v.setting;
    reset.addEventListener('click', () => tell(null));
    top.append(reset);
    body.append(top);

    const grid = forgeEl(doc, 'div', 'fx-arsenal-kits');
    for (const side of ROSTER_SIDES) {
      const col = forgeEl(doc, 'div', 'fx-arsenal-kit');
      col.append(forgeEl(doc, 'span', 'fx-setting-head', `${SIDE_LABEL[side]} characters`));
      const cols = rosterColumns(v.setting, side, v.home, v.homeCounts[side]);
      const set = (column: number, pick: { map: string; index: number } | null): void =>
        tell(setRosterColumn(v.setting, side, column, pick, v.home, v.homeCounts[side]));
      const rows = cols.length < 4 ? cols.length + 1 : cols.length;               // one more row adds a column
      for (let column = 0; column < rows; column++) {
        const pick = cols[column] ?? null;
        const row = forgeEl(doc, 'div', 'fx-roster-row');
        const mapSel = forgeEl(doc, 'select', 'fx-select');
        Object.assign(mapSel.dataset, { rosterSide: side, rosterColumn: String(column), rosterPart: 'map' });
        mapSel.setAttribute('aria-label', `${SIDE_LABEL[side]} column ${column + 1}: map`);
        if (column > 0) mapSel.append(option(NONE, pick ? '(no column)' : '(add a column)'));
        const maps = v.maps.some(([m]) => m === pick?.map) || !pick ? v.maps : [[pick.map, pick.map] as const, ...v.maps];
        // Under its header, as every map list of the Forge (the asset browser's): the multiplayer maps.
        const group = forgeEl(doc, 'optgroup', '');
        group.label = 'Multiplayer';
        group.append(...maps.map(([stem, label]) => option(stem, label)));
        mapSel.append(group);
        mapSel.value = pick?.map ?? NONE;
        mapSel.disabled = v.locked;
        mapSel.addEventListener('change', () => set(column, mapSel.value === NONE ? null : { map: mapSel.value, index: 0 }));
        const typeSel = forgeEl(doc, 'select', 'fx-select');
        Object.assign(typeSel.dataset, { rosterSide: side, rosterColumn: String(column), rosterPart: 'type' });
        typeSel.setAttribute('aria-label', `${SIDE_LABEL[side]} column ${column + 1}: character`);
        const choices = pick ? v.choicesOf(pick.map, side) : [];
        if (!pick) typeSel.append(option(NONE, '—'));
        else if (choices === null) typeSel.append(option(String(pick.index), `(reading ${pick.map}...)`));
        else {
          const listed = choices.some((c) => c.index === pick.index) ? choices : [...choices, { index: pick.index, label: `${SIDE_LABEL[side]} ${pick.index + 1} (not on ${pick.map})` }];
          typeSel.append(...listed.map((c) => option(String(c.index), c.label)));
        }
        typeSel.value = pick ? String(pick.index) : NONE;
        typeSel.disabled = v.locked || !pick || choices === null;
        typeSel.addEventListener('change', () => { if (pick) set(column, { map: pick.map, index: Number(typeSel.value) }); });
        row.append(mapSel, typeSel);
        col.append(row);
      }
      grid.append(col);
    }
    body.append(grid, forgeEl(doc, 'p', 'fx-dim fx-setting-note',
      'Each column is a character type from a disc map, with that map’s body and kit, in Play here. The lobby’s ARMORY and its server match keep the map’s own.'));
  };

  return { body, draw, onChange: (cb) => { listeners = [...listeners, cb]; } };
}
