import type { ExtractMapsOptions, ExtractMapsResult, ExtractProgress } from '../../extractMaps';

/**
 * The parity pack's "Prepare": the tester's image laid out once into the pack's maps folder and indexed (PK-5;
 * docs/specs/2026-11-03-parity-pack-design.md 4, 8 and 10, "also settled": `extractMaps` with `disc` = `maps`, so the
 * tester's drive holds the image's files once; the streams and the campaign in -- M51 is the hunt's map). Product
 * track (OT.R53): the GUI's step over PK-1's callable, an adaptation. It runs once at a time; a second call while one
 * runs is refused.
 */

export type ExtractMapsFn = (o: ExtractMapsOptions) => Promise<ExtractMapsResult>;

export interface PrepareState {
  readonly running: boolean;
  readonly done: number;
  readonly total: number;
  readonly file: string | null;
  /** The last run's refusal, in its own words, or null. */
  readonly error: string | null;
  readonly finished: boolean;
}

export interface PrepareRequest {
  readonly iso: string;
  readonly maps: string;
  /** One sentence per step: "preparing the maps: n of m -- <file>". */
  readonly onProgress?: (line: string, state: PrepareState) => void;
  readonly log?: (line: string) => void;
}

export class PrepareBusy extends Error {
  constructor() {
    super('the maps are being prepared already');
    this.name = 'PrepareBusy';
  }
}

/** The progress sentence of one extract step. */
export function progressLine(p: ExtractProgress): string {
  if (p.phase === 'index') return 'preparing the maps: writing the index';
  if (p.phase === 'copy') return `preparing the maps: ${p.done} of ${p.total} in place`;
  return `preparing the maps: ${p.done} of ${p.total}${p.file ? ` -- ${p.file}` : ''}`;
}

export interface Preparer {
  readonly state: PrepareState;
  prepare(r: PrepareRequest): Promise<ExtractMapsResult>;
}

/** A preparer over `extract` (the real `extractMaps` by default, loaded at the first call). */
export function createPreparer(extract?: ExtractMapsFn): Preparer {
  let state: PrepareState = { running: false, done: 0, total: 0, file: null, error: null, finished: false };
  return {
    get state() { return state; },
    async prepare(r) {
      if (state.running) throw new PrepareBusy();
      state = { running: true, done: 0, total: 0, file: null, error: null, finished: false };
      const log = r.log ?? ((): void => {});
      try {
        const run = extract ?? (await import('../../extractMaps')).extractMaps;
        const result = await run({
          iso: r.iso, disc: r.maps, maps: r.maps, fixtures: null, streams: true, campaign: true, cloneRoot: null,
          log, warn: log,
          onProgress: (p) => {
            if (p.phase === 'materialize') state = { ...state, done: p.done, total: p.total, file: p.file ?? null };
            const line = progressLine(p);
            r.onProgress?.(line, state);
          },
        });
        state = { ...state, running: false, finished: true, file: null };
        r.onProgress?.('the maps are prepared', state);
        return result;
      } catch (err) {
        state = { ...state, running: false, error: (err as Error).message.split('\n')[0] ?? String(err) };
        log(`preparing the maps stopped: ${(err as Error).message}`);
        throw err;
      }
    },
  };
}

/** The pack's one preparer (the real extractMaps). */
export const packPreparer: Preparer = createPreparer();

/** `packPreparer.prepare`: runs once at a time; a second call while one runs is refused (PrepareBusy). */
export function prepare(r: PrepareRequest): Promise<ExtractMapsResult> {
  return packPreparer.prepare(r);
}
