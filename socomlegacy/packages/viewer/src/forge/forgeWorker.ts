import { libraryProps, type LibraryProp } from './library';
import { HttpAssetSource, mapName, parseZdb, type AssetSource } from '@s2u/archive';
import type { Rgba } from '@s2u/gs';
import { assetLibs, libraryTexture, textureCatalog, textureLibrary, type TextureCatalogEntry } from '../mapTextures';
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
  | { kind: 'weaponSounds'; id: number; source: SourceRequest }
  /** Every texture a map's asset libraries hold (`../mapTextures` `textureCatalog`): the asset browser's Textures tab. */
  | { kind: 'textureCatalog'; id: number; source: SourceRequest; path: string; stem: string }
  /** One texture of a map decoded (`libraryTexture`); `thumb` its largest edge for a tile's picture, its mips left out. */
  | { kind: 'texture'; id: number; source: SourceRequest; path: string; stem: string; name: string; thumb?: number };

export type ForgeResponse =
  | { kind: 'list'; id: number; archives: ListedArchive[]; problems: string[] }
  | { kind: 'progress'; id: number; stage: LoadStage; done: number; total: number }
  | { kind: 'map'; id: number; map: LoadedMap }
  | { kind: 'play'; id: number; data: PlayData | null }
  | { kind: 'census'; id: number; copies: MapCopies; props?: LibraryProp[] }
  | { kind: 'scriptNames'; id: number; sounds: string[]; effects: string[] }
  | { kind: 'weaponSounds'; id: number; sounds: WeaponSoundEntry[] }
  | { kind: 'textureCatalog'; id: number; textures: TextureCatalogEntry[] }
  | { kind: 'texture'; id: number; texture: DecodedLibraryTexture | null }
  | { kind: 'error'; id: number; message: string };

const ctx = self as unknown as {
  postMessage(message: ForgeResponse, transfer?: Transferable[]): void;
  addEventListener(type: 'message', handler: (event: MessageEvent<ForgeRequest>) => void): void;
};

const sourceFor = sourceCache();

/** A texture as `texture` hands it back: `../mapTextures` `libraryTexture`'s. */
export type DecodedLibraryTexture = NonNullable<ReturnType<typeof libraryTexture>>;

/**
 * The last maps' texture libraries read (`textureLibrary`), kept so a list's thumbnails do not read a map's archive each
 * (a browser adaptation): two, the base's and the one browsed, at most.
 */
const TEXTURE_LIBS_KEPT = 2;
const textureLibs: { key: string; lib: Promise<{ lib: ReturnType<typeof textureLibrary>; libs: { stem: string; path: string }[] }> }[] = [];
function textureLibOf(request: SourceRequest, path: string, stem: string): Promise<{ lib: ReturnType<typeof textureLibrary>; libs: { stem: string; path: string }[] }> {
  const key = `${JSON.stringify(request)}|${path}`;
  const at = textureLibs.findIndex((e) => e.key === key);
  if (at >= 0) { const [e] = textureLibs.splice(at, 1); textureLibs.unshift(e!); return e!.lib; }
  const lib = sourceFor(request).read(path).then((bytes) => {
    const toc = parseZdb(bytes);
    const notes = { add(): void {} };
    const libs = assetLibs(bytes, toc, stem, notes);
    return { lib: textureLibrary(bytes, toc, stem, notes, libs.map((l) => l.stem)), libs };
  });
  textureLibs.unshift({ key, lib });
  lib.catch(() => { const i = textureLibs.findIndex((e) => e.lib === lib); if (i >= 0) textureLibs.splice(i, 1); });
  textureLibs.length = Math.min(textureLibs.length, TEXTURE_LIBS_KEPT);
  return lib;
}

/** `rgba` box-filtered down to `edge` on its longer side (never up). */
function shrunk(rgba: Rgba, edge: number): Rgba {
  const k = Math.max(1, Math.ceil(Math.max(rgba.width, rgba.height) / edge));
  if (k === 1) return rgba;
  const w = Math.max(1, Math.floor(rgba.width / k)), h = Math.max(1, Math.floor(rgba.height / k));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sum = [0, 0, 0, 0];
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
      const i = ((y * k + dy) * rgba.width + x * k + dx) * 4;
      for (let c = 0; c < 4; c++) sum[c]! += rgba.data[i + c]!;
    }
    for (let c = 0; c < 4; c++) out[(y * w + x) * 4 + c] = sum[c]! / (k * k);
  }
  return { width: w, height: h, data: out };
}

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
      } else if (request.kind === 'textureCatalog') {
        const { lib, libs } = await textureLibOf(request.source, request.path, request.stem);
        ctx.postMessage({ kind: 'textureCatalog', id: request.id, textures: lib ? textureCatalog(lib, libs) : [] });
      } else if (request.kind === 'texture') {
        const { lib } = await textureLibOf(request.source, request.path, request.stem);
        const got = lib ? libraryTexture(lib, request.name) : null;
        const texture = got && request.thumb ? { ...got, rgba: shrunk(got.rgba, request.thumb), mips: null } : got;
        const buffers = texture ? [texture.rgba, ...(texture.mips ?? [])].map((r) => r.data.buffer as ArrayBuffer) : [];
        ctx.postMessage({ kind: 'texture', id: request.id, texture }, [...new Set(buffers)]);   // each decoded afresh: its own to hand over
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
          // The geometry editor's node tags (`LoadMapOptions.worldNodes`; the draws are the disc's, the tags added).
        }, { worldNodes: true });
        ctx.postMessage({ kind: 'map', id: request.id, map }, transferables(map));
      }
    } catch (e) {
      ctx.postMessage({ kind: 'error', id: request.id, message: e instanceof Error ? e.message : String(e) });
    }
  })();
});
