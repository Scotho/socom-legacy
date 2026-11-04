import { FULL_SLOT, ITEM, type Loadout, type Side } from '@s2u/scene';

/**
 * CREATE GAME's EQlimit, GameStats byte 5 (FUN_002f7c40 D:L196733-196734). The named rewrites and default kits are
 * RUN/UIZANIM.ZAR, dlgGameLobby.rdr / SetMPWeaponValves and SetMPCharWeaponValves (research 362 §2).
 * These are menu selection rules, not class-wide firing or pickup bans. Reading, pending independent review.
 */
export function equipmentLimit(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4 ? value : 0;
}

const COMMON_OFF = [
  'Enable_frag', 'Enable_satchel', 'Enable_claymore', 'Enable_203HE', 'Enable_203SMK', 'Enable_HEgren',
  'Enable_203FRAG', 'Enable_GLFRAG', 'Enable_GLSMK', 'Enable_GLHE', 'Enable_pmn', 'Enable_RPG', 'Enable_RPG_ammo', 'Enable_LAW',
];
const LONG_GUNS = [
  'Enable_M16', 'Enable_m4Acarbine_203', 'Enable_mp5sd', 'Enable_mp5', 'Enable_ak47', 'Enable_aks74', 'Enable_m14_gun',
  'Enablesig_commando', 'Enable_uzi', 'Enable_m60e', 'Enable_m63a', 'Enable_m4Acarbine', 'Enable_M16203', 'Enable_M4A1_SD',
  'Enable_m79', 'Enable_mglmk1', 'Enable_FNP', 'Enable_AK105', 'Enable_STEYR', 'Enable_SA-80', 'Enable_OC14',
  'Enable_F2000', 'Enable_MP5K', 'Enable_552SD',
];
const SHOTGUNS = ['Enable_spas', 'Enable_jack', 'Enable_870'];
const SNIPERS = ['Enable_barret_lightm82A1', 'Enable_EquipmcmillanM87', 'Enable_stoner_sr25', 'Enable_stoner_sr25_SD', 'Enable_remington700', 'Enable_Dragonov'];
const SEAL_PISTOLS = ['Enable_Mark23', 'Enable_mark23sd', 'Enable_HkP9s', 'Enable_SR1_Gyurza', 'Enable_P228'];
const TERRORIST_PISTOLS = ['Enable_Sig226', 'Enable_glock18', 'Enable_fiveseven', 'Enable_beretta_m9', 'Enable_desert_eagle'];

/** The exact named Enable_ rewrites; untouched map valves (including C4's lock bits) remain the map's. */
export function equipmentLimitValves(valves: ReadonlyMap<string, number>, limit: number): ReadonlyMap<string, number> {
  const mode = equipmentLimit(limit);
  if (mode === 0) return valves;
  const out = new Map(valves);
  const set = (names: readonly string[], value: number): void => { for (const name of names) out.set(name, value); };
  set(COMMON_OFF, 0);
  set(['Enable_2xammo', 'Enable_smoke', 'Enable_flash'], 9);
  if (mode <= 3) set(LONG_GUNS, 0);
  if (mode === 1 || mode === 2) set(SNIPERS, 0);
  if (mode === 1 || mode === 3) set(SHOTGUNS, 0);
  if (mode === 2) set(SHOTGUNS, 9);
  if (mode === 3) set(SNIPERS, 9);
  if (mode === 1) { set(SEAL_PISTOLS, 1); set(TERRORIST_PISTOLS, 8); out.set('Enable_LasDes', 0); }
  if (mode === 3) set([...SEAL_PISTOLS, ...TERRORIST_PISTOLS, 'Enable_LasDes'], 0);
  if (mode === 1 || mode === 2) out.set('Enable_ThermScope', 0);
  if (mode === 4) set(['Enable_m4Acarbine_203', 'Enable_M16203', 'Enable_m79', 'Enable_mglmk1', 'Enable_F2000'], 0);
  return out;
}

/** SetMPCharWeaponValves rewrites every character on each side, before a character or manual kit is selected. */
export function equipmentLimitKit(base: Loadout, valves: ReadonlyMap<string, number>, side: Side, limit: number): Loadout {
  const mode = equipmentLimit(limit);
  if (mode === 0) return base;
  const c4 = (valves.get('Enable_c4') ?? 0) > (side === 'seal' ? 9 : 17);
  const last = c4 ? ITEM.C4 : FULL_SLOT;
  if (mode === 1) return [FULL_SLOT, side === 'seal' ? 16 : 4, 123, 122, last];
  if (mode === 2) return [side === 'seal' ? 81 : 83, FULL_SLOT, ITEM.DOUBLE_AMMO, 122, last];
  if (mode === 3) return [side === 'seal' ? 103 : 101, FULL_SLOT, side === 'seal' ? ITEM.DOUBLE_AMMO : 123, 122, last];
  return [base[0], base[1], ITEM.DOUBLE_AMMO, 123, c4 ? ITEM.C4 : 122];
}
