/**
 * The 43 manual turrets on 15 of the 22 retail maps, transcribed from research 215 section 2 (the package's census,
 * measured 2026-10-05 by `tools/probe-map-turrets.ts`; the same 43 as research 177 section 3). A validation lock, not a
 * new reading: `turretMapCheck.test.ts` re-reads each map archive that this host has and `e2e/turretCensus.spec.ts`
 * re-reads each one the test room can serve. Enowapi's MGL placement keeps the definition's trailing space.
 */
export interface TurretCensusRow {
  map: string;
  title: string;
  id: number;
  name: string;
  weapon: 'PKM TURRET' | 'LMG TURRET' | 'MGL FRAG TURRET';
  ammo: number;
  yaw: readonly [number, number];
  pitch: readonly [number, number];
  range: number;
  origin: readonly [number, number, number];
}

export const TURRET_CENSUS: readonly TurretCensusRow[] = [
  { map: 'MP5', title: 'Abandoned', id: 0, name: 'mp5_turret_lmg', weapon: 'LMG TURRET', ammo: 225, yaw: [-30, 30], pitch: [-45, 35], range: 22, origin: [972.334, 161.435, 1898.06] },
  { map: 'MP5', title: 'Abandoned', id: 1, name: 'mp5_turret_rmg', weapon: 'PKM TURRET', ammo: 750, yaw: [-30, 30], pitch: [-45, 35], range: 22, origin: [1130.639, 233.561, 635.082] },
  { map: 'MP9', title: 'Bitter Jungle', id: 0, name: 'mp9_turret01', weapon: 'PKM TURRET', ammo: 750, yaw: [-30, 30], pitch: [-20, 45], range: 25, origin: [1245.318, 18.154, 1381.434] },
  { map: 'MP9', title: 'Bitter Jungle', id: 1, name: 'mp9_turret02', weapon: 'PKM TURRET', ammo: 750, yaw: [-30, 30], pitch: [-20, 45], range: 25, origin: [1080.925, 18.857, 1214.788] },
  { map: 'MP9', title: 'Bitter Jungle', id: 2, name: 'mp9_turret03', weapon: 'PKM TURRET', ammo: 750, yaw: [-30, 30], pitch: [-20, 45], range: 25, origin: [2587.778, 19.214, 666.377] },
  { map: 'MP9', title: 'Bitter Jungle', id: 3, name: 'mp9_turret04', weapon: 'PKM TURRET', ammo: 750, yaw: [-30, 30], pitch: [-20, 45], range: 25, origin: [2793.574, 18.55, 880.273] },
  { map: 'MP10', title: 'Blood Lake', id: 0, name: 'mp10_turret_lmg', weapon: 'LMG TURRET', ammo: 225, yaw: [-70, 70], pitch: [-35, 45], range: 25, origin: [698.614, 141.957, 1654.371] },
  { map: 'MP10', title: 'Blood Lake', id: 1, name: 'mp10_turret_rmg', weapon: 'PKM TURRET', ammo: 750, yaw: [-70, 70], pitch: [-35, 45], range: 25, origin: [2039.017, 104.383, 1664.633] },
  { map: 'MP10', title: 'Blood Lake', id: 2, name: 'mp10_turret_mgl', weapon: 'MGL FRAG TURRET', ammo: 72, yaw: [-70, 70], pitch: [-25, 10], range: 22, origin: [1427.064, 184.234, 2135.551] },
  { map: 'MP11', title: 'Death Trap', id: 0, name: 'mp11_turret03', weapon: 'PKM TURRET', ammo: 750, yaw: [-30, 30], pitch: [-20, 45], range: 25, origin: [1239.421, -26.425, 259.477] },
  { map: 'MP11', title: 'Death Trap', id: 1, name: 'mp11_turret01', weapon: 'PKM TURRET', ammo: 750, yaw: [-30, 30], pitch: [-20, 45], range: 25, origin: [1462.695, -6.194, 726.393] },
  { map: 'MP11', title: 'Death Trap', id: 2, name: 'mp11_turret02', weapon: 'PKM TURRET', ammo: 750, yaw: [-30, 30], pitch: [-20, 45], range: 25, origin: [1097.788, -36.395, 674.233] },
  { map: 'MP51', title: 'Vigilance', id: 0, name: 'mp51_turret01', weapon: 'PKM TURRET', ammo: 750, yaw: [-70, 70], pitch: [-45, 45], range: 22, origin: [1237.637, 89.061, 948.578] },
  { map: 'MP51', title: 'Vigilance', id: 1, name: 'mp51_turret02', weapon: 'PKM TURRET', ammo: 750, yaw: [-70, 70], pitch: [-45, 45], range: 22, origin: [478.582, 97.313, 792.475] },
  { map: 'MP51', title: 'Vigilance', id: 2, name: 'mp51_turret03', weapon: 'PKM TURRET', ammo: 750, yaw: [-70, 70], pitch: [-45, 45], range: 22, origin: [687.607, 148.035, 1201.95] },
  { map: 'MP51', title: 'Vigilance', id: 3, name: 'mp51_turret04', weapon: 'PKM TURRET', ammo: 750, yaw: [-70, 70], pitch: [-45, 45], range: 22, origin: [1355.478, -14.58, 459.676] },
  { map: 'MP52', title: 'The Mixer', id: 0, name: 'mp52gren_turret_1', weapon: 'MGL FRAG TURRET', ammo: 72, yaw: [-40, 40], pitch: [-25, 0], range: 22, origin: [3602.383, 147.274, 1992.961] },
  { map: 'MP52', title: 'The Mixer', id: 1, name: 'mp52gren_turret_2', weapon: 'MGL FRAG TURRET', ammo: 72, yaw: [-40, 40], pitch: [-25, 0], range: 22, origin: [2516.767, 88.317, 2045.958] },
  { map: 'MP52', title: 'The Mixer', id: 2, name: 'mp52gun_turret_1', weapon: 'PKM TURRET', ammo: 750, yaw: [-70, 70], pitch: [-30, 45], range: 22, origin: [3597.282, 155.766, 2891.005] },
  { map: 'MP53', title: 'Foxhunt', id: 0, name: 'mp53_turret1', weapon: 'PKM TURRET', ammo: 750, yaw: [-35, 35], pitch: [-20, 45], range: 25, origin: [2522.609, 103.513, 3977.236] },
  { map: 'MP53', title: 'Foxhunt', id: 1, name: 'mp53_turret2', weapon: 'PKM TURRET', ammo: 750, yaw: [-35, 35], pitch: [-20, 45], range: 25, origin: [3372.061, 218.894, 1804.065] },
  { map: 'MP53', title: 'Foxhunt', id: 2, name: 'mp53_turret3', weapon: 'PKM TURRET', ammo: 750, yaw: [-35, 35], pitch: [-20, 45], range: 25, origin: [1623.223, 56.199, 2902.375] },
  { map: 'MP61', title: 'Sujo', id: 0, name: 'mp61turret_2', weapon: 'PKM TURRET', ammo: 750, yaw: [-25, 25], pitch: [-30, 20], range: 22, origin: [646.612, 1.643, 2210.346] },
  { map: 'MP61', title: 'Sujo', id: 1, name: 'mp61turret_1', weapon: 'PKM TURRET', ammo: 750, yaw: [-50, 60], pitch: [-45, 20], range: 22, origin: [594.96, 1.643, 2193.924] },
  { map: 'MP61', title: 'Sujo', id: 2, name: 'mp61turret_3', weapon: 'PKM TURRET', ammo: 750, yaw: [-60, 60], pitch: [-30, 20], range: 22, origin: [984.806, 62.363, 1734.289] },
  { map: 'MP62', title: 'Enowapi', id: 0, name: 'mp62MGLturret ', weapon: 'MGL FRAG TURRET', ammo: 72, yaw: [-70, 70], pitch: [-25, 10], range: 22, origin: [2590.015, 296.124, 1392.342] },
  { map: 'MP62', title: 'Enowapi', id: 1, name: 'mp62turret', weapon: 'PKM TURRET', ammo: 750, yaw: [-70, 70], pitch: [-50, 15], range: 22, origin: [1650.528, 291.303, 1889.615] },
  { map: 'MP62', title: 'Enowapi', id: 2, name: 'mp62turret2', weapon: 'PKM TURRET', ammo: 750, yaw: [-70, 70], pitch: [-50, 15], range: 22, origin: [1307.152, 292.142, 1392.921] },
  { map: 'MP64', title: 'Shadow Falls', id: 0, name: 'mp64turret_1', weapon: 'PKM TURRET', ammo: 750, yaw: [-70, 70], pitch: [-45, 45], range: 22, origin: [576.101, 112.412, 2603.979] },
  { map: 'MP64', title: 'Shadow Falls', id: 1, name: 'mp64turret_2', weapon: 'PKM TURRET', ammo: 750, yaw: [-70, 70], pitch: [-45, 45], range: 22, origin: [1782.101, 156.805, 1756.283] },
  { map: 'MP64', title: 'Shadow Falls', id: 2, name: 'mp64turret_3', weapon: 'PKM TURRET', ammo: 750, yaw: [-70, 70], pitch: [-45, 45], range: 22, origin: [440.59, 108.167, 674.156] },
  { map: 'MP71', title: 'Fish Hook', id: 0, name: 'mp71_turret01', weapon: 'PKM TURRET', ammo: 750, yaw: [-45, 45], pitch: [-45, 45], range: 22, origin: [2149.914, 188.084, 1292.843] },
  { map: 'MP71', title: 'Fish Hook', id: 1, name: 'mp71_turret02', weapon: 'PKM TURRET', ammo: 750, yaw: [-45, 45], pitch: [-45, 45], range: 22, origin: [2348.119, 234.561, 471.707] },
  { map: 'MP72', title: 'Crossroads', id: 0, name: 'mp72_turret02', weapon: 'LMG TURRET', ammo: 225, yaw: [-70, 70], pitch: [-45, 45], range: 22, origin: [2129.683, 112.5, 1462.799] },
  { map: 'MP72', title: 'Crossroads', id: 1, name: 'mp72_turret01', weapon: 'PKM TURRET', ammo: 750, yaw: [-10, 110], pitch: [-45, 35], range: 22, origin: [600.394, 56.188, 1595.459] },
  { map: 'MP73', title: 'Sandstorm', id: 0, name: 'mp73MGLturret', weapon: 'MGL FRAG TURRET', ammo: 72, yaw: [-35, 35], pitch: [-25, 10], range: 22, origin: [870.179, 143.561, 1490.162] },
  { map: 'MP73', title: 'Sandstorm', id: 1, name: 'mp73turret_1', weapon: 'PKM TURRET', ammo: 750, yaw: [-35, 35], pitch: [-25, 10], range: 22, origin: [585.595, 90.451, 1680.024] },
  { map: 'MP73', title: 'Sandstorm', id: 2, name: 'mp73turret_2', weapon: 'PKM TURRET', ammo: 750, yaw: [-35, 35], pitch: [-25, 10], range: 22, origin: [1152.504, 143.442, 1020.327] },
  { map: 'MP82', title: 'Guidance', id: 0, name: 'mp82turret_1', weapon: 'PKM TURRET', ammo: 750, yaw: [-60, 60], pitch: [-45, 45], range: 22, origin: [2098.247, 111.609, 2068.9] },
  { map: 'MP82', title: 'Guidance', id: 1, name: 'mp82turret_2', weapon: 'PKM TURRET', ammo: 750, yaw: [-60, 60], pitch: [-45, 45], range: 22, origin: [721.456, 24.079, 459.667] },
  { map: 'MP82', title: 'Guidance', id: 2, name: 'mp82turret_3', weapon: 'PKM TURRET', ammo: 750, yaw: [-60, 60], pitch: [-45, 45], range: 22, origin: [1305.0, 141.992, 1703.469] },
  { map: 'MP83', title: 'Requiem', id: 0, name: 'mp83_turret_pkm01', weapon: 'PKM TURRET', ammo: 750, yaw: [-60, 60], pitch: [-45, 45], range: 22, origin: [1613.917, 169.867, 798.443] },
  { map: 'MP83', title: 'Requiem', id: 1, name: 'mp83_turret_lmg01', weapon: 'LMG TURRET', ammo: 225, yaw: [-60, 60], pitch: [-45, 45], range: 22, origin: [965.019, 157.867, 2504.012] },
];

/** Research 177 section 3 and 215 section 2: retail maps whose walk places no manual turret. Frostfire's four `tank1` nodes are excluded there. */
export const MAPS_WITHOUT_TURRETS: readonly { map: string; title: string }[] = [
  { map: 'MP1', title: 'Blizzard' },
  { map: 'MP2', title: 'Frostfire' },
  { map: 'MP6', title: 'Desert Glory' },
  { map: 'MP7', title: 'Night Stalker' },
  { map: 'MP8', title: "Rat's Nest" },
  { map: 'MP12', title: 'The Ruins' },
  { map: 'MP81', title: 'Chain Reaction' },
];

/** The 22 retail multiplayer maps, archive id order, as research 177's census walks them. */
export const RETAIL_MAPS: readonly string[] = [
  'MP1', 'MP2', 'MP5', 'MP6', 'MP7', 'MP8', 'MP9', 'MP10', 'MP11', 'MP12',
  'MP51', 'MP52', 'MP53', 'MP61', 'MP62', 'MP64', 'MP71', 'MP72', 'MP73', 'MP81', 'MP82', 'MP83',
];

export function censusByMap(): { map: string; title: string; rows: TurretCensusRow[] }[] {
  const order: string[] = [];
  const groups = new Map<string, TurretCensusRow[]>();
  for (const row of TURRET_CENSUS) {
    const list = groups.get(row.map);
    if (list) list.push(row);
    else { groups.set(row.map, [row]); order.push(row.map); }
  }
  return order.map((map) => ({ map, title: groups.get(map)![0]!.title, rows: groups.get(map)! }));
}
