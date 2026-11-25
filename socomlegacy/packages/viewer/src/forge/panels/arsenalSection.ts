import { itemClass, slotKind, slotKindOf, VALVE_OF_ITEM, SIDE_BIT, type ArsenalItem, type ItemClass, type Side } from '@s2u/scene';
import type { SimKits } from '../../loadout';
import type { ArsenalSetting } from '../layout';
import { ARSENAL_PRESETS, arsenalWith, EMPTY_ARSENAL, kitSlotOf, setKitSlot, setSideBit, valveOf } from '../arsenalSetting';
import { forgeEl } from '../shell/panel';
import { ownButton, propRow, subsection } from './propGrid';

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
  const body = forgeEl(doc, 'div', 'fx-arsenal fx-subfolds');
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
    // Sub-sections only (the owner, 2026-11-25: "there should be no mix, only sub sections as header titles"): Weapons &
    // equipment (its Map's own in the heading, the presets a row), each side's spawn kit, the ARMORY lists (folded).
    const reset = ownButton(doc, 'Back to the map’s own weapons, kits and ARMORY lists', !!v.setting, v.locked);
    reset.dataset['arsenalReset'] = '';
    reset.addEventListener('click', () => tell(null));
    const main = subsection(doc, 'Weapons & equipment', { reset });
    body.replaceChildren(main.fold);
    if (!v.kits?.map) {
      main.table.append(propRow(doc, 'Arsenal', forgeEl(doc, 'span', 'fx-dim', 'None on this map')));
      return;
    }
    const items = listed(v.kits);
    const s = current(), mapValves = valves();

    // The presets: a row each with its switch (one row's height, as every setting), on while what it does holds -- by its
    // switch or by hand; turned off, it is undone.
    for (const p of ARSENAL_PRESETS) {
      const box = forgeEl(doc, 'input');
      box.type = 'checkbox';
      box.title = p.title;
      box.dataset['preset'] = p.id;
      box.disabled = v.locked;
      const on = p.isOn(s, mapValves);
      box.checked = on;
      box.setAttribute('aria-label', p.label);
      box.addEventListener('change', () => tell(on ? p.remove(current(), valves()) : p.apply(current(), valves())));
      const sw = forgeEl(doc, 'label', 'fx-toggle');
      sw.append(box);
      main.table.append(propRow(doc, p.label, sw));
    }
    const refused = arsenalWith(v.kits, v.setting).refused;
    if (refused.length) main.table.append(forgeEl(doc, 'p', 'fx-dim fx-setting-note fx-arsenal-refused', `Not played: ${refused.join('; ')}.`));

    // Each side's spawn kit in the same group (the owner, 2026-11-25: "merge some groups"): its side's name a row of its
    // own, then a row a slot, a pick over every type's own.
    for (const side of SIDES) {
      main.table.append(forgeEl(doc, 'div', 'fx-prop-group', `${SIDE_LABEL[side]} spawn kit`));
      for (let slot = 0; slot < 5; slot++) {
        const sel = forgeEl(doc, 'select', 'fx-select');
        sel.dataset['kitSide'] = side;
        sel.dataset['kitSlot'] = String(slot);
        sel.setAttribute('aria-label', `${SIDE_LABEL[side]} ${SLOT_LABEL[slot]}`);
        const own = forgeEl(doc, 'option', '', 'Type’s own');
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
        main.table.append(propRow(doc, SLOT_LABEL[slot]!, sel));
      }
    }

    // The ARMORY's lists (folded): a row an item, its two sides' switches side by side; a group's name a row of its own.
    // Its Reset: the lists back to the map's own, the kits kept.
    const listsReset = ownButton(doc, 'Back to the map’s own ARMORY lists', Object.keys(s.valves).length > 0, v.locked);
    listsReset.dataset['arsenalListsReset'] = '';
    listsReset.addEventListener('click', () => tell({ ...current(), valves: {} }));
    const lists = subsection(doc, 'Armory lists', { closed: !listsOpen, reset: listsReset });
    lists.fold.addEventListener('toggle', () => { listsOpen = lists.fold.open; });
    const seen = new Set<string>();
    for (const [cls, label] of GROUPS) {
      const group = items.filter((it) => itemClass(it.id) === cls);
      if (!group.length) continue;
      lists.table.append(forgeEl(doc, 'div', 'fx-prop-group', label));
      for (const it of group) {
        const name = VALVE_OF_ITEM.get(it.id)!;
        if (seen.has(name)) continue;
        seen.add(name);
        const value = valveOf(s, mapValves, name);
        const boxes = SIDES.map((side) => {
          const l = forgeEl(doc, 'label', 'fx-toggle fx-prop-check');
          const box = forgeEl(doc, 'input');
          box.type = 'checkbox';
          box.dataset['side'] = side;
          box.checked = (value & SIDE_BIT[side]) !== 0;
          box.disabled = v.locked;
          box.setAttribute('aria-label', `${it.displayName || it.name}: ${SIDE_LABEL[side]}`);
          box.addEventListener('change', () => tell(setSideBit(current(), valves(), name, side, box.checked)));
          l.append(box, forgeEl(doc, 'span', '', SIDE_LABEL[side]));
          return l;
        });
        const row = propRow(doc, it.displayName || it.name, ...boxes);
        row.dataset['valve'] = name;
        row.classList.toggle('is-changed', s.valves[name] !== undefined);
        lists.table.append(row);
      }
    }
    body.append(lists.fold);
  };

  return {
    body,
    draw,
    onChange: (cb) => { listeners = [...listeners, cb]; },
  };
}
