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
 * READING (WEAPON-LINE, 2026-11-23; seat-kill's key-job read pilot/kill/keyjob-weapon-line.md, on patches-contrib's
 * first read; reading, pending review): the weapon line's query `FUN_0031e160` (D:L416642) meets a polygon from its FRONT
 * only, on every collider the port's line can meet. The face test's side mask is chosen per collision NODE (r0004
 * 0x2ef7a0): 0x30, both crossing directions, when the node's `+0x80` bit 1 is set, else 0x20, one direction (r0001 `FUN_002d2890` D:L174831-174837).
 * The bit's
 * three stores in r0004 set it on no map node (0x1ff8f4: a ticking object's own flag byte; 0x348708: the particle DI
 * node, VOLUMETRIC, which the line's consumer drops; 0x559c4c: an actor's skel_root node, a cull box), and the bodies' hit
 * boxes on the bone nodes keep it clear. So `true` -- `segmentHits`' `frontOnly`, as the body's segment records take it
 * (research 281 s4.3) -- is the original's for the hull; no per-collider flag is needed while the line walks the hull
 * alone (`WEAPON_LINE_BODIES_PLACEHOLDER`).
 */
export const WEAPON_LINE_ONE_SIDED_READING = true;

/**
 * READING (WEAPON-LINE, 2026-11-23; seat-kill's key-job read; reading, pending review): the polygons the weapon line's
 * query returns. The test is the surface word's bit 1 (`SURFACE_SIDE`, the record's byte +8 bit 1) set and, with the mode
 * byte r0004 0x450b20 at 0 (by brackets around its writer’s calls, not a trace; r0001 `FUN_002d2890`
 * D:L174845-174862 the filter), `m_cameratype` bit 0 (the word's bit 18, `SURFACE_SKIP`) clear; nothing tests the ground bit
 * (bit 0), so FLOORS ARE AMONG THEM. That is exactly the port's movement set, `(surfaceWord(p) & (2 | 1 << 18)) === 2`
 * (`Walker.weaponLine`): over 22 r0004 maps, 202,305 faces, 0 disagree. The line keeps any slope it meets (only the
 * material's bits 0 and 1 are tested, D:L416644-416672), so a steep ramp ahead is stored and the running jump up it
 * refused (LATER 682, done; no slope test, as the original).
 */
export const WEAPON_LINE_POLYGON_SET_READING = 'movement' as 'movement' | 'walls';

/**
 * PLACEHOLDER (named; WEAPON-LINE, 2026-11-23; seat-kill's key-job read, its F7): whether the weapon line meets OTHER
 * ACTORS' bodies. The original's cast walks each cell's object list; the caller switches only its OWN model's collision off
 * around it (r0004 0x552fd0-0x552ffc, restored 0x553110-0x553128), 0x33b770 excludes no node, a bone box (ditype 3)
 * passes the polygon test above and the consumer keeps material PERSON -- so by that reading the line can stop at another
 * player's body pressed within its length. Not traced running, and the gate bits at that moment are unread; nor is what
 * the move does with a PERSON box as its stored contact. `'hull-only'`: the port's line walks the map's hull alone
 * (`segmentHits` on the grid). Settled by a capture of a body pressed against another within the line's length (does
 * the stored contact form), then a read of the contact's use.
 */
export const WEAPON_LINE_BODIES_PLACEHOLDER = 'hull-only' as 'hull-only' | 'bone-boxes';

/**
 * READING (WEAPON-LINE part 2, 2026-11-23; seat-kill's key-job read pilot/kill/keyjob-weapon-line-item.md; reading, pending
 * review): the weapon line's model BY THE BODY'S MOUNT. `FUN_0054e8f0` takes the model of the weapon mount the hand byte
 * `+0xf79` picks -- the body's four mounts at actor+0x388 (1 rifle, 2 pistol, 3 grenade: never built, zeroed; 4 launcher),
 * NOT a kit entry -- and `+0xf79` is NOT rewritten when a grenade, charge or gear item is raised, selected, cooked,
 * thrown or placed. So: 'firearm' -- with any item up the line keeps the firearm hand's model and length (never the
 * item's own); 'launcher' -- with a launcher up (`Walker`'s launcher set) the launcher's model (the LAW: AT4, 21.3236),
 * none where that model has no firepoint node (`WEAPON_LINE_NO_FIREPOINT`: the cast returns false); 'none' -- a launcher
 * followed by an item leaves the empty mount 3 picked, no line. Not cast at all (the port's own gates): a slide, a mounted
 * turret, an AI body. Named gaps (the read's G1-G4): the launcher mounts' models are inferred (a capture of the line with
 * the LAW up settles it: `WEAPON_LINE_MOUNT_MODEL_READING`); no aim-point refresh on the item path was found; the writer of
 * actor+0x388 is unread; whether the line is cast when dead is unread. The exception (GRENADE-LOWERS, 2026-11-25; a
 * capture, the port's match reading, pending review): a hand grenade up (class 'y') casts NO line -- PC 2's
 * L1578-PROBE-WEAPONS (r0004: items 121 / 126, the muzzle probe refused, no weapon-line push) and GRENADE-LOWER-r0004 (the
 * line never fires with the grenade up, still or walking); `Walker.handGrenadeUp`, after the launcher's gate.
 */
export const WEAPON_LINE_ITEM_MODEL_READING = 'by-mount' as const;

/**
 * WEAPON-LINE part 2 (the review's F3): three cases of the same read the port does not carry, named. (1) A dismount into a
 * kept item's slot (r0004 0x54abdc) writes the empty mount (3/0): no line, where the port keeps the firearm's. (2) A
 * launcher abandoned by moving (r0004 0x5569d8) goes to the kit hand's mount for a human -- the port's launcher-down to the
 * firearm, the same mount by a different path. (3) G5: the rifle/pistol flip of `+0xf79` comes at the swap's HAND-OVER, not
 * at its press, where the port flips `Walker.hand` at the swap's start -- so the new firearm's length comes a few frames
 * early. Settled by captures of each with the line's slot logged.
 */
export const WEAPON_LINE_MOUNT_CASES_READING = 'dismount-abandon-handover unported' as const;

/**
 * READING, held by a capture (the read's G1; WEAPONLINE-LAUNCHER-r0004, Shadow PC 2, r0004 on LAN Sandstorm, 2026-11-23;
 * unreviewed until its second reader): the launcher MOUNT's model is the kit's launcher item's own model
 * (`heldWeaponModels`' `launcher`). With the LAW (AT-4) in hand (`+0xf79` 4) the stored contact formed at 21.3 u from the
 * wall and not at 21.4 (two sweeps): the edge in 21.30-21.40, holding the AT4 model's 21.3236. With the RPG-7 in hand
 * (`+0xf79` 4) no weapon line formed at 8-21 u (a contact at 3 u only, the body's own segment records): no line, as
 * `WEAPON_LINE_NO_FIREPOINT` gives. The M4A1 SD control on the same wall (`+0xf79` 1) formed at 22.3-22.8 and not at 23.0,
 * the bracket of WEAPONLINE-LAW-r0004 (22.795 / 22.996). The writer of actor+0x388 (G3) stays unread.
 */
export const WEAPON_LINE_MOUNT_MODEL_READING = 'kit-model' as const;

/**
 * WEAPON-LINE part 2 (the same read): the launcher models with no `firepoint` node in WEAP_GEO, lower case -- the RPG-7's
 * model spells it `firepont`, so its `+0x14bc` is null and the cast returns false: no line with it up. The rest have one
 * (`weaponLine.test.ts` over the kit table's launchers, the dev disc).
 */
export const WEAPON_LINE_NO_FIREPOINT: ReadonlySet<string> = new Set(['rpg7']);

/**
 * PLACEHOLDER (named; WEAPON-LINE part 2, 2026-11-23): the 'none' mount of `WEAPON_LINE_ITEM_MODEL_READING` -- a launcher
 * followed by an item leaves the empty mount 3 picked, no line, until a firearm is raised -- is NOT wired: neither the
 * room nor the page keeps the body's last raised mount (the room knows the launcher up, `held`, and the hand item; not
 * which mount the item followed), so `Walker.weaponLineMountNone` is unset and the port keeps the firearm's line there (from the put-away's start,
 * `launcherMountOn`; before the review's F1 fold the launcher's line ran on through the still lower).
 * Coupled to the read's G2 (no aim-point refresh found on the item path, which would switch the line off whatever the
 * mount). Settled by a read of the item path's aim-point refresh (G2) and the mount's writer (G3), then the last-mount
 * state kept by room and page alike.
 */
export const WEAPON_LINE_MOUNT_NONE_PLACEHOLDER = 'unwired' as 'unwired' | 'wired';

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
