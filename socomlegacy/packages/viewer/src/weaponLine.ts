/**
 * SEGMENT-BODY part 2: the weapon line's length (web research 86 s3.1 and s3.8; research 281 s4.1). Each tick
 * `FUN_0054d9a0` casts a level segment along the body's facing (D:L416630-416687) and keeps its nearest hit in the slot
 * `actor+0x1140..+0x115c` (`FUN_005b0c70` D:L416687), which `FUN_005483d0` copies into the stored contact when none of
 * the body's segment records hits (D:L413618-413671); the cast itself is the mover's (`./mover` `Walker`).
 *
 * `FUN_0054e8f0` (D:L416858-416910) builds the segment from the held weapon's model -- the entry the hand byte `+0xf79`
 * picks in the table at `actor+0x388` (D:L416869), its model at `+0xc` (D:L416870, D:L416892): the length is twice
 * (D:L416902) the absolute x extent of the model's `+0x40` bounds, `|b[3] - b[0]|` through `FUN_001b3620` (D:L416901),
 * unless bit 6 (0x40) of the model's byte `+0x5f` is set (the byte shifted left 57 and tested for sign, D:L416894), when the
 * bounds come from `FUN_00541510` over the model's `+100` chain (D:L416895, D:L408768 on: the same bit-6 test at each
 * step). The runtime model is the weapon's `WEAP_GEO` root: its `nparams` bbox at +64 (`0x40`) and flag word at +92
 * (`0x5c`, so `+0x5f` is the word's top byte) -- ac's RDRAM read of the M4A1 SD's model (r0004, 2026-11-04 09:16Z,
 * `climb-angle/WEAPON-LINE.md`) holds the disc's bbox exactly and the word 0x80800855 against the disc's 0x80800055.
 */

/** The fields of a weapon model the length reads: its `nparams` flag word and bbox (min xyz, max xyz). */
export interface WeaponLineModel {
  flags: number;
  bbox: ArrayLike<number>;
}

/**
 * `FUN_0054e8f0`'s length (D:L416892-416902), in the f32 the original computes it in. Bit 6 of the flag word's top byte
 * set throws: `FUN_00541510`'s chain is not built, and no weapon model on the disc sets it (`weaponLine.test.ts`, the 59
 * of `WEAP_GEO`; the byte reads 0x80 or 0xa0 on every one, bit 7 and bit 5 -- not bit 6).
 */
export function weaponLineLength(model: WeaponLineModel): number {
  if ((((model.flags >>> 24) & 0xff) & 0x40) !== 0) throw new Error('weapon line: +0x5f bit 6 set -- FUN_00541510 chain (D:L408768) not built');
  const b = model.bbox;
  return Math.fround(Math.fround(Math.abs(Math.fround(b[3]! - b[0]!))) * 2);
}

/**
 * PROVEN (a memory read of the original running: r0004, ac, 2026-11-04 09:16Z, `climb-angle/WEAPON-LINE.md` section 1;
 * the +0x5f byte's test corrected by 6d's source read, ibid. "Correction"): the M4A1 SD's weapon line, 2 x 11.4652, from
 * its model's bounds x -3.679799 to 7.785366 (model 0x013328b0, kit slot 0, the hand byte 1). Inside the capture's
 * bracket for the reach along the facing, 22.5 to 23.4 (`climb-angle/RESULTS.md`; OBLIQUE-CLIMB-READ section 1).
 */
export const WEAPON_LINE_M4A1_SD_PROVEN = 22.9303;

/**
 * READING (the disc's data through the repository's readers: `RUN/*.ZDB` member `WEAP_GEO.ZED`, each model's `nparams`
 * bbox, `parseSceneGraph`; the rule `weaponLineLength`, `FUN_0054e8f0` D:L416892-416902): the weapon line's length for
 * each of the 59 weapon models, by `WEAP_GEO` name, to 4 places. The same on every map archive read (Frostfire's fixture,
 * M51); `weaponLine.test.ts` recomputes it from Frostfire's. The M4A1 SD's is proven (`WEAPON_LINE_M4A1_SD_PROVEN`);
 * every other is a reading.
 */
export const WEAPON_LINE_LENGTH_READING: Readonly<Record<string, number>> = {
  artillery_shell: 13.1009, grenade: 2.5372, HEgrenade: 1.4714, m4Acarbine_203: 18.4703, M203: 3.0129, mp5sd: 16.0000,
  flashbang: 1.2791, m4Acarbine: 18.4703, m4Acarbine_sd: 22.9303, ak47: 18.8592, a_mark23sd: 18.6423, baretta_m9: 14.1204,
  a_smoke_grenade: 1.4714, m16a2: 20.9511, aks74: 20.4834, c4: 5.3104, a_mark23: 14.6892, sig226: 14.3791,
  desert_eagle: 14.1196, glock18: 14.3778, hkp9s: 14.1085, jackhammer: 16.3561, sig_commando: 20.5281, mp5: 16.0000,
  fnp90: 16.0953, uzi: 16.0428, m60e: 22.0583, stoner_m63a: 23.8670, claymore: 6.0112, fiftycal_box: 4.6008,
  barretm82A1: 28.5052, detonator: 3.0627, mcmillanM87: 25.7531, stoner_sr25: 22.3449, footbomb: 7.9894, fiveseven: 14.3574,
  m16_M203: 20.9511, m79: 16.2484, mglmk1: 17.1523, m14_gun: 19.9626, AT4: 21.3236, remington870: 17.9082,
  spas12: 19.6180, RPGrenade: 7.2627, RPG7: 31.1420, AT4_Heat: 7.2627, remington700: 23.4213, PMN_mine: 3.5449,
  steyr_aug9: 20.9118, Dragunov: 30.6813, ak105: 20.4834, M11_p228: 14.1204, SP10_gyuraz: 14.1204, BMMG_f2k: 19.8925,
  RA14_groza: 17.5234, hk5k: 13.8987, iw80a2: 17.2469, laser_designator: 14.0000, bleu_chem: 8.4908,
};

const LENGTH_BY_LOWER = new Map(Object.entries(WEAPON_LINE_LENGTH_READING).map(([name, length]) => [name.toLowerCase(), length] as const));

/**
 * The weapon line's length for a held model by its `ModelName`, case aside (research 94's `MODEL_NAME_CASE_READING`: the
 * game finds a weapon's model in `WEAP_GEO` case aside -- the SA-80 A2 names `IW80A2`, every library holds `iw80a2`, and
 * the retail SA-80 draws), or null for a name no weapon model has.
 */
export function weaponLineLengthOf(model: string): number | null {
  return LENGTH_BY_LOWER.get(model.toLowerCase()) ?? null;
}

/**
 * PLACEHOLDER (named; research 86 s3.8): whether the weapon line's query `FUN_0031e160` (D:L416642) meets a polygon from
 * its front only. Unread: the query's own crossing test is not transcribed. `true`: the hull's one-sided test, as the
 * body's segment records take it (`segmentHits`' `frontOnly`, research 281 s4.3) -- the line starts at the body and
 * runs out, so a face it meets first is met from its front either way, but a line starting inside a collider (a body
 * pressed into a corner) would meet the far side's back face under `false`. Settled by a read of `FUN_0031e160`'s
 * crossing test, or a capture with the line starting behind a face. Its polygon set is its own question
 * (`WEAPON_LINE_POLYGON_SET_PLACEHOLDER`).
 */
export const WEAPON_LINE_ONE_SIDED_PLACEHOLDER = true;

/**
 * PLACEHOLDER (named; research 86 s3.8; fresh review 1's F3): which polygons the weapon line's query `FUN_0031e160`
 * (D:L416642) returns -- whether floors are among them. Unread: the function only fills a query on world `+0x14c` (the
 * review's read), and the set that query walks is not transcribed. `'movement'`: the port asks the movement's surfaces
 * (bit 1 set, bit 18 clear), as the body's segment records' query does (`Walker.segmentHit`), floors among them; the line
 * keeps any slope it meets (D:L416644-416672: only the material's bits 0 and 1 are tested), so a steep ramp ahead is
 * stored and the running jump up it refused (LATER 682). This alone decides LATER 682. Settled by a read of
 * `FUN_0031e160`'s polygon set, or an r0004 capture of a running jump pressed partway up Frostfire's `rmp1`.
 */
export const WEAPON_LINE_POLYGON_SET_PLACEHOLDER = 'movement' as 'movement' | 'walls';

/**
 * PLACEHOLDER (named; research 86 s3.8; fresh review 1's F1): the weapon line's length with an item up. `FUN_0054e8f0`
 * takes the model of the kit entry the hand byte `+0xf79` picks (D:L416869-416870), so with a grenade up the line is the
 * item's (`grenade` 2.5372 in `WEAPON_LINE_LENGTH_READING`), not the rifle's. The port's mover, shared by the room and the
 * page, carries the firearm hand only (`Walker.hand`, 0 or 1): an item up is held outside it (the room's `held` and
 * throw state, the page's `FirearmHands`), and which entry `+0xf79` names in each item state (selected, raised, cooked,
 * a launcher up) is not read. `'firearm'`: the line keeps the firearm hand's model with an item up. Settled by a read of
 * `+0xf79`'s writes, then the item's model carried into the mover on both sides.
 */
export const WEAPON_LINE_ITEM_MODEL_PLACEHOLDER = 'firearm' as 'firearm' | 'item';

/**
 * READING (research 86 s3.8; the controller's ruling between readings, 6d, 2026-11-04, for the owner to see; was
 * `WEAPON_LINE_BOTS_PLACEHOLDER` 'cast'): the port's bots cast no weapon line. The original casts it only when the
 * body's controller (`actor+0xc0`) answers its vtable +0x2c (D:L416630-416633). The AI's controller, `CSealCtrlAi`
 * (vtable 0x6693f0, research 191, 334 s9), holds `FUN_00575c30` at +0x2c -- the ELF's word at 0x66941c, whose two
 * instructions return 0 (`jr ra` with `v0` = 0 in the delay slot; re-read on the disc's `socom2_game.elf` for this
 * reading, as research 334 s9 and 199 s12.5 read it) -- where the local player's `CSealCtrl` (0x6694b0) holds
 * `0x5431f0`, which returns 1. So the original's AI never forms a contact from it. The same on r0004 (OT.R97; the
 * r0004 investigation's function-diff table, `scratch/code-diff/classify.json`, and the desktop recompilation's r0004
 * output): the cast's twin 0x552790 is 'changed' (raw_diff 97 of 674 words) but still loads the controller's vtable +0x2c, calls
 * it and branches on the answer (0x552f74-0x552f8c) before its `+0x1344` read (`FUN_00552790_0x552790.cpp`);
 * `FUN_00575c30`'s twin 0x57b010 is 'same' (raw_diff 0: `jr ra`, `v0` = 0, `FUN_0057b010_0x57b010.cpp`). The
 * r0004 AI controller's vtable slot itself is not re-read. The port's bots (OT.R81) are the
 * AI's model (`MoverSim.ai`, `IsAi` at +0x30, 0x575c40 returns 1): `'none'`, set on every bot body (`MatchBots.adopt`,
 * and given back by `release` and `dispose`; the room's `newSim` for an AI seat, the climb discovery's and the ladder
 * probe's movers; the hostage's walker, `hostageFollow.ts`, and the zombies' and their obstacle probe's, all AI bodies
 * with no weapon). `'cast'` (was): they cast it as the player's body does.
 */
export const WEAPON_LINE_BOTS_READING = 'none' as 'cast' | 'none';
