import { parseRdr, readZarMembers, Zar, type AssetSource } from '@s2u/archive';
import { ARMORY_SETS, armoryItemScripts, locTable, parseAnimSets, parseLocTable, uiSet, UIMNLOC } from '@s2u/scene';
import type { Rgba } from '@s2u/gs';
import type { MissionRecord, ValveEntry } from '@s2u/ui';
import { ARMORY_MEMBERS, armoryFromDisc, type ArmoryData } from '../armoryData';
import { captionText } from '../armoryLayout';
import { missionsFromReaderc } from '../createGameHost';
import { tauntCaptions } from '../tauntData';
import { readGlobalValves } from '../originalOptions';
import type { LoadingScreen } from '../loadingAssets';

/**
 * What the modern UI reads off the opened image (MU-4b / MU-5b of `docs/plans/2026-10-09-modern-ui-parallel.md`; MU.R3:
 * "every ISO-gated control reads it"). A browser adaptation (MU.R1) over two of the original's own reads -- nothing the
 * game would not read, by the repository's readers, never a new decoding:
 *
 * - **`readValveDefaults`**: `global_valves.rdr` whole, its rows in order with their type words (`../originalOptions`
 *   `readGlobalValves`): what `CValve_Open` (`FUN_00351d40`, the call D:L152619) loads at the game's start (research
 *   229 §2; 104 R104.6) -- the option valves' defaults the settings page needs for a first-time card and Reset.
 * - **`readItemNames`**: each ARMORY UI index's name as the ARMORY shows it -- the `weapmodeltext` caption the
 *   `ShowAndSpin` branch for that index sets (`@s2u/scene` `armoryItemScripts` over `RUN/UIZANIM.ZAR`, research 95
 *   R95.8), through the menus' strings (`UIMnLOC`, `parseLocTable`) as `../armoryLayout` `captionText` turns a caption
 *   into its text (the name `../armory` `Armory.view` draws). An index whose caption is empty is left out. The profile's
 *   loadout records carry these UI indices (`/lobby/loadout`, `FUN_003d3230`'s table, `../armoryState` `ITEM_OF_UI`).
 *
 * - **`readMissions`** (MU-13d): `RUN/READERC.ZAR :: missionlist.rdr`, the game's mission table (`FUN_002c9540`),
 *   through the front end's own reader (`../createGameHost` `missionsFromReaderc`, as `../frontEnd` reads it for
 *   CREATE GAME's PLAY LIST): what GAME DETAILS (`FUN_002e1f20`) names a listed game's map and mode from.
 *
 * - **`readMapPicture`** (LU-2'): a multiplayer map's loading picture and title -- the map's own loading screen as the
 *   page already reads it before a match (`../loadingAssets` `loadingFromDisc`: the map's `READERM.ZAR/mission.rdr`
 *   binding, `load_picture` from its `LoadingScreenAssets` library; research 125), taken whole and cut to the binding's
 *   `mission_title` and the `load_picture` bitmap (`pictureOf`). No new decoding; for Home's Play online card, only with
 *   the disc in (MU.R3; `docs/plans/briefs/modern-ui-launcher-layout.md` 2.5).
 *
 * - **`readMedalPictures`** (MU2-7; MU2-3's review F2, R155.11): the medal of merit's five pictures, `Medal_Blue.tif`
 *   .. `Medal_Black.tif` by the medal 1-5 -- the medal column's TEXTURES, indexed by the value (`MEDAL_TEXTURES`;
 *   research 155 §2.3, R147.6), the same five the foot of the online dialogs shows beside the persona's own name
 *   (`playername`'s `Medal_*` IMAGE objects, 16 x 16; `ActivateMedalOfMerit` / `DisplayMedalOfMerit`, research 155 §3)
 *   -- out of the bank PLAYER RANKING's `LIBRARIES` name (`MEDAL_DIALOG`'s `ui/assetlib/uimp`: `RUN/UI/UIMP_TXR.ZED` and
 *   its `_PAL`, `FUN_003199c0`'s cut, research 95 §5.1) through the front end's own bank reader (`../frontEndAssets`
 *   `pageUiTextures`: each texture against its bank's palettes, top row first). `null.tif` (medal 0) is drawn as
 *   nothing, as the original's is. A dev-disc test holds the names, the bank and the sizes against the dialog.
 *
 * - **`readMissionArmory`** (MU2-8; MU2-7's finding): a mission's ARMORY data with its world -- the roster, the arsenal,
 *   `mission.rdr`'s valves -- as the game lobby's ARMORY reads them (`../armoryData` `armoryFromDisc(source,
 *   missionMapPath(m), M, { models: false, world: true })`, `../frontEnd`), for the loadout editor (`./loadout`), which
 *   read the opened image directly before. A mission the page cannot map to an archive (`../lobbyMatch`
 *   `missionMapPath`) answers null, as the editor's own read did. Once per mission per image.
 *
 * Each read is made once per image (a failed one again on the next call) and its answer shared, in this page's memory
 * only: nothing is written anywhere (RS.R8, MU.R2), and the answers go with the image. The front end, mounted later over
 * the same source, makes its own reads as it always has: nothing here is handed to it.
 */
export interface DiscAssets {
  /** `global_valves.rdr`'s rows (`readGlobalValves`). */
  readValveDefaults(): Promise<readonly ValveEntry[]>;
  /** The ARMORY's caption of each UI index (`readArmoryItemNames`). */
  readItemNames(): Promise<ReadonlyMap<number, string>>;
  /** `HudCLOC.rdr`'s captions by id and key (`tauntData` `tauntCaptions`): the game's own taunt and team-message texts (MU-13c). Optional: an older fake has none. */
  readTauntCaptions?(): Promise<Readonly<Record<string, string>>>;
  /** `missionlist.rdr`'s records (`readMissionList`), for GAME DETAILS (MU-13d). Optional: an older fake has none. */
  readMissions?(): Promise<readonly MissionRecord[]>;
  /** A map's loading picture and title (`readMapPicture`; LU-2'), the stem an `MP<n>` archive's. Optional: an older fake has none. */
  readMapPicture?(stem: string): Promise<MapPicture>;
  /** The medal of merit's pictures by the medal 1-5 (`readMedalPictures`; MU2-7), top row first. Optional: an older fake has none. */
  readMedalPictures?(): Promise<ReadonlyMap<number, Rgba>>;
  /** A mission's ARMORY data with its world (`readMissionArmory`; MU2-8), null for a mission with no archive. Optional: an older fake has none. */
  readMissionArmory?(mission: string): Promise<ArmoryData | null>;
}

/** A map's loading picture (top row first, as `loadingFromDisc` gives it) and its title, each null where the disc has none. */
export interface MapPicture { title: string | null; picture: Rgba | null }

/** The two readers, injectable for a test. */
export interface DiscReaders {
  valves(source: AssetSource): Promise<readonly ValveEntry[]>;
  itemNames(source: AssetSource): Promise<ReadonlyMap<number, string>>;
  /** Optional: a test's readers that read no captions (`readTauntCaptions` then refuses). */
  captions?(source: AssetSource): Promise<Readonly<Record<string, string>>>;
  /** Optional: a test's readers that read no mission table (`readMissions` then refuses). */
  missions?(source: AssetSource): Promise<readonly MissionRecord[]>;
  /** Optional: a test's readers that read no map picture (`readMapPicture` then refuses). */
  mapPictures?(source: AssetSource, stem: string): Promise<MapPicture>;
  /** Optional: a test's readers that read no medal (`readMedalPictures` then refuses). */
  medals?(source: AssetSource): Promise<ReadonlyMap<number, Rgba>>;
  /** Optional: a test's readers that read no mission's ARMORY (`readMissionArmory` then refuses). */
  missionArmory?(source: AssetSource, mission: string): Promise<ArmoryData | null>;
}

/**
 * The medal column's TEXTURES in its order, the index the medal of merit 0-5 (research 155 §2.3: `null.tif`, then
 * ENSIGN's `Medal_Blue` .. ADMIRAL's `Medal_Black`; an IMAGE cell draws `TEXTURES[value]`, research 147 R147.6). Read off
 * `MEDAL_DIALOG` by the dev-disc test (`test/modern/discAssets.test.ts`), and the foot's five pictures with them.
 */
export const MEDAL_TEXTURES = ['null.tif', 'Medal_Blue.tif', 'Medal_Bronze.tif', 'Medal_Silver.tif', 'Medal_Gold.tif', 'Medal_Black.tif'] as const;
/** PLAYER RANKING's layout (`RUN/UI/READERC.ZAR`): its medal column, its RANK INSIGNIA legend and the foot's medals (research 155). */
export const MEDAL_DIALOG = 'dlgLadderLobby.rdr';
/** The bank `MEDAL_DIALOG`'s `LIBRARIES` name (`ui/assetlib/uimp`), cut as the engine cuts it (`FUN_003199c0`): `RUN/UI/UIMP_TXR.ZED`. */
export const MEDAL_BANK = 'UIMP';

/**
 * The five medal pictures by the medal 1-5, out of `MEDAL_BANK` through the front end's bank reader (`../frontEndAssets`
 * `pageUiTextures`, imported on first use so the launcher's chunk does not carry it before a disc is in). Refuses when
 * the bank will not read or holds none of them; a picture the bank lacks is left out (that medal is drawn as nothing).
 */
export async function readMedalPictures(source: AssetSource): Promise<Map<number, Rgba>> {
  const { pageUiTextures } = await import('../frontEndAssets');
  const bank = pageUiTextures(source, [MEDAL_BANK], null, []);
  const missing = await bank.ready;
  if (missing.length) throw new Error(missing.join('; '));
  const out = new Map<number, Rgba>();
  for (let medal = 1; medal < MEDAL_TEXTURES.length; medal++) {
    const got = bank.textures(MEDAL_TEXTURES[medal]!);
    if (got) out.set(medal, { width: got.width, height: got.height, data: got.data });
  }
  if (out.size === 0) throw new Error(`RUN/UI/${MEDAL_BANK}_TXR.ZED holds no medal picture`);
  return out;
}

/** A map archive's stem as the room lists name it (`MP2`, `MP51`): the only form a path is built from. */
const MAP_STEM = /^MP\d{1,3}$/;

/** The binding's `mission_title` and its `load_picture` bitmap out of a read loading screen (`loadingFromDisc`). */
export function pictureOf(screen: LoadingScreen): MapPicture {
  const name = screen.binding?.picture?.toLowerCase() ?? null;
  const found = name ? screen.bitmaps.find(([n]) => n === name) : undefined;
  return { title: screen.binding?.title ?? null, picture: found ? found[1] : null };
}

/**
 * `RUN/<stem>.ZDB`'s loading screen through `loadingFromDisc`, cut by `pictureOf` (the read a map's load makes first).
 * The reader is imported on first use, so the launcher's chunk does not carry it before a disc is in.
 */
export async function readMapPicture(source: AssetSource, stem: string): Promise<MapPicture> {
  const { loadingFromDisc } = await import('../loadingAssets');
  return pictureOf(await loadingFromDisc(source, `RUN/${stem}.ZDB`));
}

/**
 * A mission's ARMORY data with its world, as the game lobby reads it (`armoryFromDisc` over `missionMapPath(mission)`,
 * `{ models: false, world: true }`); null for a mission with no archive. The path's reader is imported on first use.
 */
export async function readMissionArmory(source: AssetSource, mission: string): Promise<ArmoryData | null> {
  const { missionMapPath } = await import('../lobbyMatch');
  const path = missionMapPath(mission);
  return path ? armoryFromDisc(source, path, mission.toUpperCase(), { models: false, world: true }) : null;
}

/** `RUN/READERC.ZAR`'s `missionlist.rdr` through `missionsFromReaderc` (the read `../frontEnd` makes for the PLAY LIST). */
export async function readMissionList(source: AssetSource): Promise<MissionRecord[]> {
  return missionsFromReaderc(await source.read('RUN/READERC.ZAR'));
}

/** `RUN/READERC.ZAR :: HudCLOC.rdr` through `tauntCaptions`, the read `tauntData`'s `readTauntDefaults` and `readTauntData` make. */
export async function readHudCaptions(source: AssetSource): Promise<Record<string, string>> {
  const bytes = (await readZarMembers(source, 'RUN/READERC.ZAR', ['HudCLOC.rdr'])).get('HudCLOC.rdr');
  if (!bytes) throw new Error('RUN/READERC.ZAR :: HudCLOC.rdr missing');
  return tauntCaptions(parseRdr(bytes));
}

/**
 * The ARMORY's name of each UI index: `ShowAndSpin`'s branch per `UiWeapon` value, its `weapmodeltext` caption
 * (`ArmoryItemScript.caption`) through `UIMnLOC` (`captionText`). The first branch of an index wins, as
 * `armoryItemScripts` lists them.
 */
export async function readArmoryItemNames(source: AssetSource): Promise<Map<number, string>> {
  const sets = parseAnimSets(Zar.parse(await source.read(ARMORY_MEMBERS.zanim)));
  const items = armoryItemScripts(uiSet(sets, ARMORY_SETS.spin), uiSet(sets, ARMORY_SETS.screen));
  const bytes = (await readZarMembers(source, UIMNLOC.archive, [UIMNLOC.member])).get(UIMNLOC.member);
  if (!bytes) throw new Error(`${UIMNLOC.archive} :: ${UIMNLOC.member} missing`);
  const loc = locTable(parseLocTable(parseRdr(bytes)));
  const out = new Map<number, string>();
  for (const item of items) {
    const name = captionText(item.caption, loc);
    if (name.trim() !== '' && !out.has(item.ui)) out.set(item.ui, name);
  }
  return out;
}

export const DISC_READERS: DiscReaders = { valves: readGlobalValves, itemNames: readArmoryItemNames, captions: readHudCaptions, missions: readMissionList, mapPictures: readMapPicture, medals: readMedalPictures, missionArmory: readMissionArmory };

const facades = new WeakMap<AssetSource, DiscAssets>();

/** The readers over `source`, one facade per source (so its reads are made once); `readers` for a test. */
export function discAssetsOf(source: AssetSource, readers: DiscReaders = DISC_READERS): DiscAssets {
  const held = readers === DISC_READERS ? facades.get(source) : undefined;
  if (held) return held;
  const once = <T>(read: () => Promise<T>): (() => Promise<T>) => {
    let pending: Promise<T> | null = null;
    return () => (pending ??= read().catch((e: unknown) => { pending = null; throw e; }));
  };
  const pictures = new Map<string, () => Promise<MapPicture>>();
  const armories = new Map<string, () => Promise<ArmoryData | null>>();
  const facade: DiscAssets = Object.freeze({
    readValveDefaults: once(() => readers.valves(source)),
    readItemNames: once(() => readers.itemNames(source)),
    readTauntCaptions: once(() => (readers.captions ? readers.captions(source) : Promise.reject(new Error('no caption reader')))),
    readMissions: once(() => (readers.missions ? readers.missions(source) : Promise.reject(new Error('no mission reader')))),
    readMedalPictures: once(() => (readers.medals ? readers.medals(source) : Promise.reject(new Error('no medal reader')))),
    readMapPicture: (stem: string): Promise<MapPicture> => {
      if (!MAP_STEM.test(stem)) return Promise.reject(new Error(`not a map archive: ${stem}`));
      let read = pictures.get(stem);
      if (!read) { read = once(() => (readers.mapPictures ? readers.mapPictures(source, stem) : Promise.reject(new Error('no map picture reader')))); pictures.set(stem, read); }
      return read();
    },
    readMissionArmory: (mission: string): Promise<ArmoryData | null> => {
      const key = mission.toUpperCase();
      let read = armories.get(key);
      if (!read) { read = once(() => (readers.missionArmory ? readers.missionArmory(source, key) : Promise.reject(new Error('no mission ARMORY reader')))); armories.set(key, read); }
      return read();
    },
  });
  if (readers === DISC_READERS) facades.set(source, facade);
  return facade;
}
