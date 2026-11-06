import type { LoadedMap, LoadStage } from '../loadMap';
import type { PlayClips } from '../play';
import type { SourceRequest } from '../discSource';
import type { ForgeRequest, ForgeResponse, ListedArchive } from './forgeWorker';
import { copiesOf, type MapCopies } from './mapCensus';

/**
 * FORGE (a browser adaptation, no original): the forge's archives, read by its own decode thread (`./forgeWorker`, the
 * viewer's readers) from the source the page holds -- the served tree in a development build, the player's own disc in
 * a release (FG.R12) -- each kept once decoded so a palette or a layout's pieces can draw from several.
 */

export interface ArchiveEntry {
  /** The stem (`MP2`, `M51`): what a layout names. */
  stem: string;
  path: string;
  /** The mission's own name (`mission.rdr`; a campaign mission's through HUDCLOC, `./catalog`). */
  label: string;
  campaign: boolean;
}

/**
 * An archive's name as the forge shows it: the listing's label (a campaign mission's through HUDCLOC, `./catalog`
 * `missionName`), else `fallback` (a loaded map's own `mission.rdr` name, which for a campaign mission is the raw
 * message key `_60883_SeedingChaos_MSG`: never shown where the label is known -- DX-4's browser run, 2026-10-16).
 */
export function labelOf(entries: readonly Pick<ArchiveEntry, 'stem' | 'label'>[], stem: string, fallback: string): string {
  return entries.find((a) => a.stem === stem)?.label ?? fallback;
}

export type OnProgress = (stem: string, stage: LoadStage, done: number, total: number) => void;

export class Archives {
  private readonly worker = new Worker(new URL('./forgeWorker.ts', import.meta.url), { type: 'module' });
  private next = 0;
  private readonly waiting = new Map<number, { resolve: (r: ForgeResponse) => void; reject: (e: Error) => void; stem?: string }>();
  private loaded = new Map<string, Promise<LoadedMap>>();
  private clipsAsked: Promise<PlayClips | null> | null = null;
  /** Each archive's census (`census`), asked once; the asks one at a time, so the worker holds one map at once. */
  private counted = new Map<string, Promise<MapCopies | null>>();
  /** The maps being loaded for use now: the census waits on them. */
  private loading = new Set<Promise<unknown>>();
  private censusQueue: Promise<unknown> = Promise.resolve();
  onProgress: OnProgress | null = null;
  /** The archives the source holds, once listed (a path by stem). */
  private paths = new Map<string, string>();

  constructor(private source: SourceRequest) {
    this.worker.addEventListener('message', (e: MessageEvent<ForgeResponse>) => {
      const r = e.data;
      const w = this.waiting.get(r.id);
      if (!w) return;
      if (r.kind === 'progress') { if (w.stem) this.onProgress?.(w.stem, r.stage, r.done, r.total); return; }
      this.waiting.delete(r.id);
      if (r.kind === 'error') w.reject(new Error(r.message));
      else w.resolve(r);
    });
  }

  /** The source the archives are read from (the served tree, or the player's disc): the match's extras read it too. */
  sourceRequest(): SourceRequest { return this.source; }

  /** Another source (a disc opened): what was decoded from the last one is let go. */
  setSource(source: SourceRequest): void {
    this.source = source;
    this.loaded = new Map();
    this.paths = new Map();
    this.clipsAsked = null;
    this.counted = new Map();
    this.censusQueue = Promise.resolve();
  }

  private ask(make: (id: number) => ForgeRequest, stem?: string): Promise<ForgeResponse> {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject, ...(stem ? { stem } : {}) });
      this.worker.postMessage(make(id));
    });
  }

  /** Every map archive the source holds: the multiplayer maps, then the campaign's missions, by name. */
  async list(): Promise<{ entries: ArchiveEntry[]; problems: string[] }> {
    const r = await this.ask((id) => ({ kind: 'list', id, source: this.source }));
    const listed: ListedArchive[] = r.kind === 'list' ? r.archives : [];
    this.paths = new Map(listed.map((a) => [a.stem, a.path]));
    return { entries: listed.map((a) => ({ stem: a.stem, path: a.path, label: a.name, campaign: a.campaign })), problems: r.kind === 'list' ? r.problems : [] };
  }

  /** The archive `stem` decoded, once. */
  /**
   * The archive's doors, turrets and hostages listed (`./mapCensus` `copiesOf`): off its map where it is loaded already,
   * else read by the worker, which keeps only the lists. One at a time, and each after any map being loaded for use
   * (`load`), which goes first. Null where it will not read.
   */
  census(stem: string): Promise<MapCopies | null> {
    let p = this.counted.get(stem);
    if (!p) {
      const path = this.paths.get(stem) ?? `RUN/${stem}.ZDB`;
      p = this.censusQueue.then(async () => {
        while (this.loading.size) await Promise.allSettled([...this.loading]);
        const loaded = this.loaded.get(stem);
        if (loaded) return loaded.then(copiesOf, () => null);
        return this.ask((id) => ({ kind: 'census', id, source: this.source, path })).then((r) => (r.kind === 'census' ? r.copies : null), () => null);
      });
      this.censusQueue = p;
      this.counted.set(stem, p);
    }
    return p;
  }

  load(stem: string): Promise<LoadedMap> {
    let p = this.loaded.get(stem);
    if (!p) {
      const path = this.paths.get(stem) ?? `RUN/${stem}.ZDB`;
      p = this.ask((id) => ({ kind: 'load', id, source: this.source, path }), stem).then((r) => {
        if (r.kind !== 'map') throw new Error(`loading ${stem}: no map came back`);
        return r.map;
      });
      p.catch(() => { this.loaded.delete(stem); });
      this.loaded.set(stem, p);
      const held = p.catch(() => null);
      this.loading.add(held);
      void held.then(() => this.loading.delete(held));
    }
    return p;
  }

  /**
   * The play mode's clips (`RUN/MOTION_P.ZAR`'s named clips and `motion.rdr`'s entries), asked once, as the test room
   * asks; null when the source has none -- the body then stands in its bind pose.
   */
  clips(names: readonly string[]): Promise<PlayClips | null> {
    this.clipsAsked ??= this.ask((id) => ({ kind: 'play', id, source: this.source, clips: [...names] }))
      .then((r) => (r.kind === 'play' ? r.data : null), () => null);
    return this.clipsAsked;
  }
}
