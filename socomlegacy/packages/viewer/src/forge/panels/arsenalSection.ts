import { itemClass, slotKind, slotKindOf, VALVE_OF_ITEM, SIDE_BIT, type ArsenalItem, type ItemClass, type Side } from '@s2u/scene';
import type { SimKits } from '../../loadout';
import type { ArsenalSetting } from '../layout';
import { ARSENAL_PRESETS, arsenalWith, EMPTY_ARSENAL, kitSlotOf, setKitSlot, setSideBit, valveOf } from '../arsenalSetting';
import { forgeEl } from '../shell/panel';

/**
 * The Map Settings panel's Weapons & equipment section (a browser adaptation over `../arsenalSetting`; the owner,
 * 2026-11-10): the map's item valves as a grid of SEAL / Terrorist switches, each side's kit slots, and the presets --
 * every control an edit of the layout's `settings.arsenal`, the values as the map's own where the layout names none.
 * The launcher rounds' valves are not drawn: the menu rewrites them from the primary (`@s2u/scene` `menuValves`,
 * `FUN_00240e60` D:L89585), so a switch there would do nothing.
 */
export interface ArsenalView {
  setting: ArsenalSetting | null | undefined;
  /** The map's arsenal (`LoadedMap.arsenal`); null, a map without one. */
  kits: SimKits | null;
  locked: boolean;
}

export interface ArsenalSection {
  body: HTMLElement;
  draw(view: ArsenalView): void;
  /** Told each edit: the next setting, or null for the map's own. */
  onChange(cb: (next: ArsenalSetting | null) => void): void;
}

const GROUPS: readonly (readonly [ItemClass, string])[] = [
  ['rifle', 'Rifles'], ['smg', 'SMGs'], ['shotgun', 'Shotguns'], ['mg', 'Machine guns'], ['sniper', 'Sniper rifles'],
  ['grenadeLauncher', 'Grenade launchers'], ['pistol', 'Pistols'], ['rocketLauncher', 'Rocket launchers'],
  ['explosive', 'Explosives'], ['grenade', 'Grenades'], ['gear', 'Gear'],
];
const DRAWN: ReadonlySet<ItemClass> = new Set(GROUPS.map(([c]) => c));
const SIDES: readonly Side[] = ['seal', 'terrorist'];
const SIDE_LABEL: Readonly<Record<Side, string>> = { seal: 'SEAL', terrorist: 'Terrorist' };
const SLOT_LABEL = ['Primary', 'Secondary', 'Equipment 1', 'Equipment 2', 'Equipment 3'];

/** The items a row or a kit slot may name: in the file's order, with a valve, of a class the menu lists. */
function listed(kits: SimKits): ArsenalItem[] {
  const a = kits.table.arsenal;
  return a.order.map((id) => a.items.get(id)!).filter((it) => it && VALVE_OF_ITEM.has(it.id) && DRAWN.has(itemClass(it.id)));
}

export function buildArsenalSection(doc: Document): ArsenalSection {
  const body = forgeEl(doc, 'div', 'fx-arsenal');
  let listeners: ((next: ArsenalSetting | null) => void)[] = [];
  let view: ArsenalView = { setting: null, kits: null, locked: false };
  let drawn = false, listsOpen = false;
  const tell = (next: ArsenalSetting | null): void => {
    const empty = next && Object.keys(next.valves).length === 0 && next.kits.seal.length === 0 && next.kits.terrorist.length === 0;
    for (const l of listeners) l(empty ? null : next);
  };
  const current = (): ArsenalSetting => view.setting ?? EMPTY_ARSENAL;
  const valves = (): ReadonlyMap<string, number> => view.kits?.map?.valves ?? new Map();

  const draw = (v: ArsenalView): void => {
    // Unchanged (the page redraws its settings on every slider step): the section, its focus and its open lists kept.
    if (drawn && v.setting === view.setting && v.kits === view.kits && v.locked === view.locked) return;
    drawn = true;
    view = v;
    body.replaceChildren(forgeEl(doc, 'h3', '', 'Weapons & equipment'));
    if (!v.kits?.map) {
      body.append(forgeEl(doc, 'p', 'fx-dim fx-setting-note', 'This map has no arsenal: its players carry the baked M4A1 SD and Mark 23.'));
      return;
    }
    const items = listed(v.kits);
    const s = current(), mapValves = valves();

    // The presets and Map's own.
    const chips = forgeEl(doc, 'div', 'fx-arsenal-presets');
    for (const p of ARSENAL_PRESETS) {
      const b = forgeEl(doc, 'button', 'fx-chip', p.label);
      b.type = 'button';
      b.title = p.title;
      b.dataset['preset'] = p.id;
      b.disabled = v.locked;
      // A toggle: lit (the panel's `.fx-chip.is-on`, gold) while what it does holds -- by its click or by hand -- and a
      // click on a lit one undoes it.
      const on = p.isOn(s, mapValves);
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', () => tell(on ? p.remove(current(), valves()) : p.apply(current(), valves())));
      chips.append(b);
    }
    const reset = forgeEl(doc, 'button', 'fx-chip fx-setting-reset', 'Map’s own');
    reset.type = 'button';
    reset.title = 'The map’s own weapons and kits, from the disc';
    reset.dataset['arsenalReset'] = '';
    reset.disabled = v.locked || !v.setting;
    reset.addEventListener('click', () => tell(null));
    chips.append(reset);
    body.append(chips);

    // Each side's kit: a pick a slot over every type's own.
    const kitsEl = forgeEl(doc, 'div', 'fx-arsenal-kits');
    for (const side of SIDES) {
      const col = forgeEl(doc, 'div', 'fx-arsenal-kit');
      col.append(forgeEl(doc, 'span', 'fx-setting-head', `${SIDE_LABEL[side]} spawn kit`));
      for (let slot = 0; slot < 5; slot++) {
        const sel = forgeEl(doc, 'select', 'fx-select');
        sel.dataset['kitSide'] = side;
        sel.dataset['kitSlot'] = String(slot);
        sel.setAttribute('aria-label', `${SIDE_LABEL[side]} ${SLOT_LABEL[slot]}`);
        const own = forgeEl(doc, 'option', '', `${SLOT_LABEL[slot]}: type’s own`);
        own.value = '';
        sel.append(own, ...items.filter((it) => slotKindOf(it.id) === slotKind(slot)).map((it) => {
          const o = forgeEl(doc, 'option', '', it.displayName || it.name);
          o.value = String(it.id);
          return o;
        }));
        const at = kitSlotOf(s, side, slot);
        sel.value = at === null ? '' : String(at);
        sel.disabled = v.locked;
        sel.addEventListener('change', () => tell(setKitSlot(current(), valves(), side, slot, sel.value === '' ? null : Number(sel.value))));
        col.append(sel);
      }
      kitsEl.append(col);
    }
    body.append(kitsEl);

    const refused = arsenalWith(v.kits, v.setting).refused;
    if (refused.length) body.append(forgeEl(doc, 'p', 'fx-dim fx-setting-note fx-arsenal-refused', `Not played: ${refused.join('; ')}.`));

    // The ARMORY's lists: a row a valve, a switch a side.
    const grid = forgeEl(doc, 'details', 'fx-arsenal-grid');
    grid.open = listsOpen;
    grid.addEventListener('toggle', () => { listsOpen = grid.open; });
    grid.append(forgeEl(doc, 'summary', '', 'ARMORY lists (who may pick each item)'));
    const table = forgeEl(doc, 'table', '');
    const head = forgeEl(doc, 'tr', '');
    head.append(forgeEl(doc, 'th', '', 'Item'), ...SIDES.map((sd) => forgeEl(doc, 'th', '', SIDE_LABEL[sd])));
    table.append(head);
    const seen = new Set<string>();
    for (const [cls, label] of GROUPS) {
      const group = items.filter((it) => itemClass(it.id) === cls);
      if (!group.length) continue;
      const gr = forgeEl(doc, 'tr', 'fx-arsenal-group');
      const th = forgeEl(doc, 'th', '', label);
      th.colSpan = 3;
      gr.append(th);
      table.append(gr);
      for (const it of group) {
        const name = VALVE_OF_ITEM.get(it.id)!;
        if (seen.has(name)) continue;
        seen.add(name);
        const tr = forgeEl(doc, 'tr', '');
        tr.dataset['valve'] = name;
        const value = valveOf(s, mapValves, name);
        tr.classList.toggle('is-changed', s.valves[name] !== undefined);
        tr.append(forgeEl(doc, 'td', '', it.displayName || it.name));
        for (const side of SIDES) {
          const td = forgeEl(doc, 'td', '');
          const box = forgeEl(doc, 'input');
          box.type = 'checkbox';
          box.dataset['side'] = side;
          box.checked = (value & SIDE_BIT[side]) !== 0;
          box.disabled = v.locked;
          box.setAttribute('aria-label', `${it.displayName || it.name}: ${SIDE_LABEL[side]}`);
          box.addEventListener('change', () => tell(setSideBit(current(), valves(), name, side, box.checked)));
          td.append(box);
          tr.append(td);
        }
        table.append(tr);
      }
    }
    grid.append(table);
    body.append(grid, forgeEl(doc, 'p', 'fx-dim fx-setting-note',
      'The map’s own valves where you change none. A kit slot opens its item to that side; a type the ARMORY would refuse keeps its own kit.'));
  };

  return {
    body,
    draw,
    onChange: (cb) => { listeners = [...listeners, cb]; },
  };
}
