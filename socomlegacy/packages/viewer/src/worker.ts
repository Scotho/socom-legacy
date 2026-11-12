import { HttpAssetSource, installMemberOverrides, type AssetSource, type MapInfo, type MemberOverrideBytes } from '@s2u/archive';
import { requestLabel, sourceCache, type SourceRequest } from './discSource';
import { installModOverrides, type ModOverrideBytes } from './mods/override';
import { listDiscMaps, type IndexProblem } from './discIndex';
import { loadMap, transferables, type LoadedMap, type LoadStage } from './loadMap';
import { playFromDisc, playTransferables, type PlayData } from './motionTable';
import {
  loopTransferables, renderAmbienceLoops, renderReverb, reverbTransferables, soundFromDisc, soundTransferables, type SoundData,
} from './soundData';
import { LONG_LOOP_SECONDS_PLACEHOLDER, LOOP_FADE_SECONDS_PLACEHOLDER, LOOP_SECONDS_PLACEHOLDER } from './loopLength';
import type { RenderedSound } from '@s2u/sound';
import { effectsFromDisc, effectTransferables, type EffectData } from './effectData';
import { armoryFromDisc, armoryTransferables, type ArmoryData } from './armoryData';
import { loadingFromDisc, loadingTransferables, loadWithScreen, type LoadingScreen } from './loadingAssets';
import { campaignPathsOf, servedCampaignPaths } from './forge/servedPaths';

/**
 * The decode thread. A 12 MB archive, 416 VIF packets and 37 palettised textures are a few hundred
 * milliseconds of tight loops; done here the page keeps rendering and the camera keeps moving while a map
 * comes in. Everything it sends back travels in the transfer list, so nothing is copied.
 */

/**
 * Where a request's archives come from (design spec §3.1): the served disc tree, the player's own disc image (W1.7,
 * milestone M5), a picked folder (DA-3) or the disc's read set kept in this browser (DX-3, `{ kind: 'stored' }`, opened
 * here by `./discStored` through `sourceCache`). The type is `./discSource`'s, re-exported so every importer of it from here
 * is unchanged.
 */
export type { DiscEntry, SourceRequest } from './discSource';

/**
 * What the page asks of this worker. Every request carries an `id` that its answer repeats: two loads can
 * be in flight at once (the boot auto-load and a map the player picked a moment later), they finish in
 * whatever order their archives decode in, and the page must be able to tell the answer it still wants
 * from the one it has moved on from.
 */
export type ViewerRequest =
  | {
    kind: 'index'; id: number; source: SourceRequest;
    /**
     * EPH campaign stand (`./testroomCampaign`; a browser adaptation, a development instrument): the devmode test room
     * asks for the campaign mission archives the source holds too. Absent on every other page, and the reply is unchanged.
     */
    campaign?: boolean;
  }
  | {
    kind: 'load'; id: number; source: SourceRequest; path: string;
    /**
     * Test-room model pack: level-piece ids to leave out of the merged world draw (`worldPieces`). Absent on every
     * other load, and the draw is then the one this worker has always posted.
     */
    worldPieces?: readonly string[];
    /** Attach the loaded map's world-piece catalog. Does not, by itself, omit a draw. */
    listWorldPieces?: boolean;
  }
  /** The play mode's clips (W2.2b): `RUN/MOTION_P.ZAR`'s named clips and `motion.rdr`'s entries for them, once a source. */
  | { kind: 'play'; id: number; source: SourceRequest; clips: string[] }
  /**
   * The original's loading screen alone (`./loadingAssets` `loadingFromDisc`; the forge's Play, `./forge/match`
   * `forgeLoadingScreen`): answered with a `loading` message, as a `load`'s screen is, and no map.
   */
  | { kind: 'loadingScreen'; id: number; source: SourceRequest; path: string }
  /** A map's sound (socomlegacy/docs/research/81, `./soundData`): its banks, the script, the materials, the weapons, the callbacks. */
  | { kind: 'sound'; id: number; source: SourceRequest; path: string; archive: string; cuesFrom?: { path: string; archive: string }; /** A forge switch's sounds, by the map each is from (`soundFromDisc` `lend`). */ lend?: { from: string; names: string[] }[];
    /** A forge layout's ambient effects' loops (`./forge/forgeObjects` `forgeAmbientEmitters`), sounded as the map's emitters. */
    emitters?: SoundData['emitters'] }
  /** EFFECTS: a map's effect programs, models, textures and mark tables (socomlegacy/docs/research/89, `./effectData`). */
  | { kind: 'effects'; id: number; source: SourceRequest; path: string; archive: string; borrow?: { path: string; names: string[] } | { path: string; names: string[] }[] }
  /** The pre-round ARMORY's layout, scripts, strings, fonts, models, bitmaps and roster for a map (web sprint 5, `./armoryData`). */
  | { kind: 'armory'; id: number; source: SourceRequest; path: string; archive: string; /** The UI models too (false: the page holds them). */ models?: boolean };

/**
 * Test-room mods (`./mods/override`). Kept off `ViewerRequest`: that type always carries an `id`, and the match and
 * the forge post it. An empty list clears the table. No other page sends this, and until one arrives a read is the disc's.
 */
export type ModOverrideMessage = { kind: 'mods'; entries: readonly ModOverrideBytes[]; members: readonly MemberOverrideBytes[] };
/** The disc's own paths, so the panel can mark a mod file as added or as a replacement. */
export type ModDiscMessage = { kind: 'mod-disc' };

/** What this worker accepts. The map requests, plus the test room's mod table. */
export type ViewerInbound = ViewerRequest | ModOverrideMessage | ModDiscMessage;

/**
 * What comes back. `error` carries the request that failed so the page can say what it was doing, and
 * `progress` arrives repeatedly during a load so the page can show a bar rather than a frozen picture.
 *
 * A progress message is advisory: it carries the same `id`, and the page drops the ones whose id it has
 * moved on from, exactly as it drops a stale map.
 */
export type ViewerResponse =
  /** `problems`: the archives a disc image holds that would not name themselves, and why (`./discIndex`). */
  | {
    kind: 'index'; id: number; maps: MapInfo[]; problems: IndexProblem[];
    /** The campaign mission archives the source holds (`RUN/M<NN>.ZDB`), only when the request asked (`campaign`). */
    campaign?: string[];
  }
  | { kind: 'map'; id: number; map: LoadedMap }
  /**
   * The original's loading screen for a `load` (INT-LOADING, `./loadingAssets`): read and posted before its map's load
   * begins (`loadWithScreen`), so the page shows it while the map decodes. Never an error: what will not read is in its `missing`.
   */
  | { kind: 'loading'; id: number; data: LoadingScreen }
  | { kind: 'progress'; id: number; stage: LoadStage; done: number; total: number }
  /** The clips and their table entries, or null when the source has no `MOTION_P.ZAR` (the body keeps its bind pose). */
  | { kind: 'play'; id: number; data: PlayData | null }
  /** The map's sound data; with no `SOUNDS/BNKSTORE.ZAR` it holds no banks and names the archive in `missing`. */
  | { kind: 'sound'; id: number; data: SoundData }
  /** The same map's beds and emitters rendered as loops, after its sound data (`renderAmbienceLoops`). */
  | { kind: 'soundLoops'; id: number; loops: { name: string; sound: RenderedSound }[] }
  /** The map's effect data: whatever would not read is left out and said in its `missing`. */
  | { kind: 'effects'; id: number; data: EffectData }
  /** The map's ARMORY data: whatever would not read is left out and said in its `missing`. */
  | { kind: 'armory'; id: number; data: ArmoryData }
  | { kind: 'error'; id: number; doing: string; message: string };

/**
 * The open disc's paths, before mods. Kept off `ViewerResponse`: that type always carries an `id`, and the match,
 * the forge and the loading screen read it. The test-room panel is the only listener (`./mods/panel`).
 */
export type ModDiscReply = { kind: 'mod-disc'; paths: string[] };

/** Worker globals without pulling the WebWorker lib in beside the DOM one (they collide on `self`). */
const ctx = self as unknown as {
  postMessage(message: ViewerResponse | ModDiscReply, transfer?: Transferable[]): void;
  addEventListener(type: 'message', handler: (event: MessageEvent<ViewerInbound>) => void): void;
};

/**
 * This thread's sources (`./discSource` `sourceCache`, shared with `./movieWorker`): the disc last asked for, kept so an
 * image's directories are walked once rather than once a request, and recognised by what the page's files carry (each
 * request's `File` is a fresh clone); a different disc of either kind replaces it. The served tree per base URL.
 */
const sourceFor = sourceCache();
let discListing: { source: AssetSource; paths: string[] } | null = null;

ctx.addEventListener('message', (event: MessageEvent<ViewerInbound>) => {
  const request = event.data;
  void (async () => {
    try {
      if (request.kind === 'index') {
        // The served index already carries every map's name (`extract-maps.ts` read each `mission.rdr`
        // once), so filling the picker costs one small fetch. A disc image has no such index, so
        // `listMaps` names its maps -- by range, each archive's table of contents and `READERM.ZAR`, tens
        // of kilobytes apiece rather than the 224 MB of all 22 -- and says which archive would not name itself, and why.
        const source = sourceFor(request.source);
        const { maps, problems } = source instanceof HttpAssetSource ? { maps: await source.maps(), problems: [] }
          : await listDiscMaps(source);
        // EPH campaign stand: a disc's own listing, or the served tree's HEAD probe (the forge's, `./forge/servedPaths`).
        const campaign = !request.campaign ? undefined
          : source instanceof HttpAssetSource ? (request.source.kind === 'http' ? await servedCampaignPaths(request.source.baseUrl) : [])
          : campaignPathsOf(await source.list());
        ctx.postMessage({ kind: 'index', id: request.id, maps, problems, ...(campaign ? { campaign } : {}) });
      } else if (request.kind === 'sound') {
        // Never an error either: without the banks the walk is silent.
        const data = await soundFromDisc(sourceFor(request.source), request.path, request.archive, request.cuesFrom, request.lend);
        if (request.emitters?.length) data.emitters.push(...request.emitters);   // a forge layout's ambient loops, rendered with the map's
        data.loopsFollow = true;
        // The loops are rendered from the bank bytes before those are handed over, and sent after the data.
        const loops = renderAmbienceLoops(data, LOOP_SECONDS_PLACEHOLDER, LOOP_FADE_SECONDS_PLACEHOLDER, LONG_LOOP_SECONDS_PLACEHOLDER);
        renderReverb(data);                           // the reverb's response here, not on the page's unlock
        ctx.postMessage({ kind: 'sound', id: request.id, data }, [...soundTransferables(data), ...reverbTransferables(data)]);
        ctx.postMessage({ kind: 'soundLoops', id: request.id, loops }, loopTransferables(loops));
      } else if (request.kind === 'effects') {
        // Never an error either: a part that will not read is left out and named in `missing`.
        const data = await effectsFromDisc(sourceFor(request.source), request.path, request.archive, request.borrow);
        ctx.postMessage({ kind: 'effects', id: request.id, data }, effectTransferables(data));
      } else if (request.kind === 'armory') {
        // Never an error either: a part that will not read is left out and named in `missing`.
        const data = await armoryFromDisc(sourceFor(request.source), request.path, request.archive, { models: request.models !== false });
        ctx.postMessage({ kind: 'armory', id: request.id, data }, armoryTransferables(data));
      } else if (request.kind === 'mods') {
        installModOverrides(request.entries);
        installMemberOverrides(request.members);
      } else if (request.kind === 'mod-disc') {
        const raw = sourceFor.raw();
        let paths: string[] = [];
        if (raw) {
          if (discListing?.source !== raw) discListing = { source: raw, paths: await raw.list() };
          paths = discListing.paths;
        }
        ctx.postMessage({ kind: 'mod-disc', paths });
      } else if (request.kind === 'loadingScreen') {
        const data = await loadingFromDisc(sourceFor(request.source), request.path);
        ctx.postMessage({ kind: 'loading', id: request.id, data }, loadingTransferables(data));
      } else if (request.kind === 'play') {
        // Never an error either: without the owner's pack the body stands in its bind pose.
        const data = await playFromDisc(sourceFor(request.source), request.clips);
        ctx.postMessage({ kind: 'play', id: request.id, data }, data ? playTransferables(data) : []);
      } else {
        // Throttled to one message per stage per 2 percent: a 13 MB archive arrives in hundreds of
        // chunks, and posting each one costs more than the bar is worth.
        let last = -1;
        // The loading screen's few small reads come first and it is posted before the map's load begins (`loadWithScreen`).
        const source = sourceFor(request.source);
        const map = await loadWithScreen(
          () => loadingFromDisc(source, request.path),
          (data) => ctx.postMessage({ kind: 'loading', id: request.id, data }, loadingTransferables(data)),
          () => loadMap(source, request.path, (stage, done, total) => {
            const step = total > 0 ? Math.floor((done / total) * 50) : done;
            const mark = stage.charCodeAt(0) * 1000 + step;
            if (mark === last) return;
            last = mark;
            ctx.postMessage({ kind: 'progress', id: request.id, stage, done, total });
          }, request.worldPieces?.length || request.listWorldPieces
            ? { worldPieces: request.worldPieces, listWorldPieces: request.listWorldPieces === true }
            : undefined),
        );
        ctx.postMessage({ kind: 'map', id: request.id, map }, transferables(map));
      }
    } catch (e) {
      const doing = request.kind === 'mods' || request.kind === 'mod-disc' ? 'installing mods'
        : request.kind === 'load' ? `loading ${request.path}`
        : request.source.kind !== 'http' ? `reading ${requestLabel(request.source)}` : 'listing the maps';
      const id = request.kind === 'mods' || request.kind === 'mod-disc' ? 0 : request.id;
      ctx.postMessage({ kind: 'error', id, doing, message: e instanceof Error ? e.message : String(e) });
    }
  })();
});
