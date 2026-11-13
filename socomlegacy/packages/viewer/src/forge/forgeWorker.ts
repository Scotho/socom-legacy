import { libraryProps, type LibraryProp } from './library';
import { HttpAssetSource, mapName, type AssetSource } from '@s2u/archive';
import { locTable, readLocArchive, type LocTable } from '@s2u/scene';
import { sourceCache, type SourceRequest } from '../discSource';
import { loadMap, transferables, type LoadedMap, type LoadStage } from '../loadMap';
import { playFromDisc, playTransferables, type PlayData } from '../motionTable';
import { archivesOf, missionName } from './catalog';
import { copiesOf, type MapCopies } from './mapCensus';
import { bankSoundNames, weaponSoundCatalog, type WeaponSoundEntry } from '../soundData';
import { effectProgramsFromDisc } from '../effectData';
import { scriptEffectsOf, scriptSoundsOf } from './scriptAssets';
import { servedPaths } from './servedPaths';

/**
 * FORGE (FG-11, FG-16; a browser adaptation, no original): the forge's decode thread. It reads any source the page names
 * -- the served tree in a development build, the player's own disc (an image, a folder, the launcher's stored copy) in a
 * release (OT.R34: a build hosts no game data) -- with the viewer's own readers (`../loadMap`, `../motionTable`), and lists
 * every map archive on it, the campaign's missions with the multiplayer maps, each by its own name (`./catalog`).
 */

/** HUDCLOC: the table a campaign mission's description names (`@s2u/scene` `LOC_ARCHIVES`, HudC 60000-60904). */
const HUD_LOC = 'RUN/LOCALE/STATES/HUDCLOC.ZAR';

export interface ListedArchive { stem: string; path: string; name: string; campaign: boolean }

export type ForgeRequest =
  | { kind: 'list'; id: number; source: SourceRequest }
  | { kind: 'load'; id: number; source: SourceRequest; path: string }
  | { kind: 'play'; id: number; source: SourceRequest; clips: string[] }
  /** The map's doors, turrets and hostages listed (`./mapCensus` `copiesOf`), the map itself let go: nothing transferred. */
  | { kind: 'census'; id: number; source: SourceRequest; path: string }
  /** A map's sounds and effects a switch's script may play (`./scriptAssets` `ScriptNames`): its banks' and its sets'. */
  | { kind: 'scriptNames'; id: number; source: SourceRequest; path: string; archive: string }
  /** The guns' sounds (`../soundData` `weaponSoundCatalog`): the Sound choice's Weapons, apart from every map's list. */
  | { kind: 'weaponSounds'; id: number; source: SourceRequest };

export type ForgeResponse =
  | { kind: 'list'; id: number; archives: ListedArchive[]; problems: string[] }
  | { kind: 'progress'; id: number; stage: LoadStage; done: number; total: number }
  | { kind: 'map'; id: number; map: LoadedMap }
  | { kind: 'play'; id: number; data: PlayData | null }
  | { kind: 'census'; id: number; copies: MapCopies; props?: LibraryProp[] }
  | { kind: 'scriptNames'; id: number; sounds: string[]; effects: string[] }
  | { kind: 'weaponSounds'; id: number; sounds: WeaponSoundEntry[] }
  | { kind: 'error'; id: number; message: string };

const ctx = self as unknown as {
  postMessage(message: ForgeResponse, transfer?: Transferable[]): void;
  addEventListener(type: 'message', handler: (event: MessageEvent<ForgeRequest>) => void): void;
};

const sourceFor = sourceCache();

async function hudTable(source: AssetSource): Promise<LocTable | null> {
  try { return locTable(readLocArchive(await source.read(HUD_LOC), 'HudC').entries); } catch { return null; }
}

async function list(request: SourceRequest): Promise<{ archives: ListedArchive[]; problems: string[] }> {
  const source = sourceFor(request);
  const served = source instanceof HttpAssetSource && request.kind === 'http' ? await servedPaths(source, request.baseUrl) : null;
  const rows = archivesOf(served ? served.paths : await source.list());
  const hud = rows.some((r) => r.campaign) ? await hudTable(source) : null;
  const problems: string[] = [];
  const archives = await Promise.all(rows.map(async (r): Promise<ListedArchive> => {
    let name = served?.names.get(r.path.toUpperCase());
    if (!name) {
      try { name = missionName(await mapName(source, r.path), hud); } catch (e) {
        problems.push(`${r.path}: ${e instanceof Error ? e.message : String(e)}`);
        name = r.stem;
      }
    }
    return { ...r, name };
  }));
  return { archives, problems };
}

ctx.addEventListener('message', (event: MessageEvent<ForgeRequest>) => {
  const request = event.data;
  void (async () => {
    try {
      if (request.kind === 'list') {
        const { archives, problems } = await list(request.source);
        ctx.postMessage({ kind: 'list', id: request.id, archives, problems });
      } else if (request.kind === 'play') {
        const data = await playFromDisc(sourceFor(request.source), request.clips);
        ctx.postMessage({ kind: 'play', id: request.id, data }, data ? playTransferables(data) : []);
      } else if (request.kind === 'scriptNames') {
        // Every sound its banks hold and its programs play (a stream's name among them); every effect of its two sets.
        const src = sourceFor(request.source);
        // The guns' sounds left out: they are the Weapons category's (`weaponSounds`), every map's alike.
        const [banks, fx, guns] = await Promise.all([bankSoundNames(src, request.archive).catch(() => [] as string[]), effectProgramsFromDisc(src, request.path),
          weaponSoundCatalog(src).catch(() => [] as WeaponSoundEntry[])]);
        const gun = new Set(guns.map((g) => g.name));
        ctx.postMessage({ kind: 'scriptNames', id: request.id, sounds: [...new Set([...banks, ...scriptSoundsOf(fx.mission)])].filter((n) => !gun.has(n.trim())).sort(), effects: scriptEffectsOf(fx.all) });
      } else if (request.kind === 'weaponSounds') {
        ctx.postMessage({ kind: 'weaponSounds', id: request.id, sounds: await weaponSoundCatalog(sourceFor(request.source)).catch(() => []) });
      } else if (request.kind === 'census') {
        const map = await loadMap(sourceFor(request.source), request.path);
        ctx.postMessage({ kind: 'census', id: request.id, copies: copiesOf(map), props: libraryProps(map) });   // the asset browser's Shared and All
      } else {
        let last = -1;
        const map = await loadMap(sourceFor(request.source), request.path, (stage, done, total) => {
          const mark = stage.charCodeAt(0) * 1000 + (total > 0 ? Math.floor((done / total) * 50) : done);
          if (mark === last) return;
          last = mark;
          ctx.postMessage({ kind: 'progress', id: request.id, stage, done, total });
        });
        ctx.postMessage({ kind: 'map', id: request.id, map }, transferables(map));
      }
    } catch (e) {
      ctx.postMessage({ kind: 'error', id: request.id, message: e instanceof Error ? e.message : String(e) });
    }
  })();
});
