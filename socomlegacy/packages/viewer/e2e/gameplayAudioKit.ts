import { applyPicks, menuValves, slotLocked, type Arsenal, type Loadout, type Pick, type Side } from '@s2u/scene';

/** Browser audio test arrangement only; the server still validates every pick. */
export function prepareAudioKit(arsenal: Arsenal, valves: ReadonlyMap<string, number>, side: Side, base: Loadout, target: number): { picks: Pick[]; kit: Loadout } {
  // RUN/ZWEAPON.ZAR: M67, AN-M8, Mark141, HE. These are the existing audio cases.
  if (![121, 122, 123, 126].includes(target)) throw Error(`unsupported audio fixture grenade ${target}`);
  const seen = menuValves(valves, base[0]);
  const candidates: Pick[][] = base.slice(2).includes(target) ? [[]] : [2, 3, 4].map(slot => [{ slot, id: target }]);
  for (const picks of candidates) {
    const out = applyPicks(arsenal, valves, side, base, picks);
    if ('refused' in out) continue;
    const kit = out.loadout;
    if (kit[0] !== base[0] || kit[1] !== base[1] || !kit.slice(2).includes(target)) continue;
    if ([2, 3, 4].some(slot => slotLocked(seen, side, base, slot) && kit[slot] !== base[slot])) continue;
    return { picks, kit };
  }
  throw Error(`no legal audio fixture kit for ${side}/${target}`);
}
