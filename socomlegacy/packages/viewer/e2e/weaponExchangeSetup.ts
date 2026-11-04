import {applyPicks, menuValves, slotLocked, type Arsenal, type Loadout, type Side} from '@s2u/scene';

/** Test preparation only: drive the real Armory, never write a kit or bypass its valves. */
export interface ExchangeArmoryDriver {
  read(): Promise<{ screen: string | null; row: number | null; committed: number | null; kits: readonly (readonly number[])[] }>;
  press(button: number): Promise<void>;
}

/** RUN/ZWEAPON.ZAR ids: M67 121 / HE 126. This chooses test equipment, not original gameplay behavior. */
export function damagingEquipmentSlot(kit: readonly number[]): number {
  return kit.findIndex((id, slot) => slot >= 2 && (id === 121 || id === 126));
}

/** Shared bounded driver; every item change remains an original Armory input. */
function armoryControls(driver: ExchangeArmoryDriver) {
  const read = async () => {
    const a = await driver.read();
    if (a.screen !== 'row' || a.committed === null || !a.kits[a.committed]) throw Error('Exchange setup: Armory row unavailable');
    return {row: a.row, kit: [...a.kits[a.committed]!]};
  };
  const row = async (target: number, button: number) => {
    for (let n = 0; n < 6 && (await read()).row !== target; n++) await driver.press(button);
    if ((await read()).row !== target) throw Error(`Exchange setup: Armory row ${target} unavailable`);
  };
  return {read, row};
}

/** The Exchange regression specifically needs M14; other death scenarios retain their chosen primary. */
export async function prepareExchangeKit(driver: ExchangeArmoryDriver): Promise<number[]> {
  const {read, row} = armoryControls(driver);
  await row(1, 12);
  for (let n = 0; n < 70 && (await read()).kit[0] !== 60; n++) await driver.press(15);
  if ((await read()).kit[0] !== 60) throw Error('Exchange setup: legal M14 choice unavailable');
  return prepareDamagingEquipment(driver);
}

/** Enter after committing a character column; leave on Primary for the existing Up -> DONE flow. */
export async function prepareDamagingEquipment(driver: ExchangeArmoryDriver): Promise<number[]> {
  const {read, row} = armoryControls(driver);
  const before = (await read()).kit;
  await row(1, 12);
  // Keep an existing M67/HE in any equipment slot. Only a kit without one needs editing.
  if (damagingEquipmentSlot(before) < 0) {
    await row(3, 13); // original Armory equipment 1; all changes still pass its map/team valves
    for (let n = 0; n < 70 && ![121, 126].includes((await read()).kit[2]!); n++) await driver.press(15);
    if (![121, 126].includes((await read()).kit[2]!)) throw Error('Armory setup: no legal damaging grenade in equipment 1');
    // Passing a unique item such as 2X can change its old slot. Restore those
    // collateral changes through the same legal controls, keeping only the intended grenade edit.
    for (const slot of [3, 4]) if ((await read()).kit[slot] !== before[slot]) {
      await row(slot + 1, 13);
      for (let n = 0; n < 70 && (await read()).kit[slot] !== before[slot]; n++) await driver.press(15);
      if ((await read()).kit[slot] !== before[slot]) throw Error(`Armory setup: cannot restore equipment slot ${slot}`);
    }
    await row(1, 12);
  }
  const prepared = (await read()).kit;
  if (damagingEquipmentSlot(prepared) < 0 || [0, 1, 3, 4].some(slot => prepared[slot] !== before[slot])) {
    throw Error('Armory setup: equipment navigation changed another slot');
  }
  return prepared;
}


/** Browser scenario plan; choices still pass the original map/team rules before controller navigation. */
export function planExchangeKit(ctx: {arsenal: Arsenal; valves: ReadonlyMap<string, number>; side: Side}, current: Loadout) {
  const seen = menuValves(ctx.valves, current[0]);
  const immutable = [2, 3, 4].filter(slot => slotLocked(seen, ctx.side, current, slot))
    .map(slot => ({slot, id: current[slot]!}));
  const editable = [2, 3, 4].filter(slot => !immutable.some(locked => locked.slot === slot));
  if (editable.length < 2) throw Error('Exchange plan needs two originally editable equipment slots');
  const last = editable.at(-1)!;
  const picks = [
    {slot: 1, id: ctx.side === 'terrorist' ? 7 : 8, category: 'pistol'},
    {slot: editable[0]!, id: 122, category: 'grenade'}, {slot: editable[1]!, id: 121, category: 'grenade'},
    {slot: last, id: 123, category: 'grenade'}, {slot: last, id: 194, category: 'gear'},
  ];
  const accepted = applyPicks(ctx.arsenal, ctx.valves, ctx.side, current, picks);
  if ('refused' in accepted) throw Error(`Exchange plan refused: ${accepted.refused} at ${accepted.at}`);
  return {picks, completeKit: accepted.loadout, immutable};
}
