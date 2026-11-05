/**
 * GM-13 (plan `docs/plans/2026-11-01-gpu-menus.md`, row GM-13; research 380 §5): the byte budget of the menus' HD
 * replacement loads -- agent/hd-subrect's review F3: `replacement()` loads every payload of a key at once, outside the
 * runtime's applied cap (~120 MB decoded for `font_titlebar_01`'s 8 regions and its whole). PRODUCT TRACK, a browser
 * adaptation: it decides when a load starts, never what it loads or draws. No GL here, so the page's HD lookup
 * (`hdMenuTextures.ts`) imports it statically while the GPU modules stay `import()`-only. GM-13c: a key's peak is the
 * pack runtime's own (`hdKeyPeak`, `./hdTexturePack`, already in that static graph).
 */
import { hdKeyPeak, type HdEntry } from './hdTexturePack';

/**
 * No original; bounds the browser's memory while the menus' HD replacements load: the bytes the loads in flight may
 * hold at their peak (decoded payloads and their copies, the composite and its turned copy). 256 MiB keeps today's
 * four whole 4x backgrounds at once (`HD_CONCURRENT_LOADS`; 4 x 3 x 16 MiB = 192 MiB) and lets a key of
 * `font_titlebar_01`'s shape (~120 MB all at once; GM-13c decodes it in turn) run beside a background. A start value,
 * measured on the box (GM-13b's perf run), never tuned by feel.
 */
export const HD_UI_LOAD_BYTES_ADAPTATION = 256 * 1024 * 1024;

/**
 * Loads admitted first come first served while the bytes in flight plus the next load's stay within the cap; a load
 * larger than the cap runs alone (so it always runs). A later load never overtakes an earlier one (a large key is not
 * starved). A load's bytes are freed when it settles, resolved or rejected.
 */
export class UiGpuLoadBudget {
  private inFlight = 0;
  private running = 0;
  private peak = 0;
  private queue: { bytes: number; start: () => void }[] = [];

  constructor(readonly cap: number = HD_UI_LOAD_BYTES_ADAPTATION) {}

  /** The bytes the loads running now were admitted with. */
  get bytesInFlight(): number { return this.inFlight; }
  /** The most bytes ever in flight at once. */
  get peakBytes(): number { return this.peak; }
  /** Loads waiting for the budget. */
  get waiting(): number { return this.queue.length; }

  /**
   * `task` run once `bytes` fit (a non-finite or negative estimate counts as 0). `signal` (GM-13 review F2): aborted
   * while the load waits, it leaves the queue unrun and the promise rejects (`AbortError`); aborted before, it rejects
   * at once. A load already running is not stopped (its bytes stay counted until it settles).
   */
  run<T>(bytes: number, task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const b = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
    return new Promise<T>((resolve, reject) => {
      const aborted = (): Error => Object.assign(new Error('UiGpuLoadBudget: aborted'), { name: 'AbortError' });
      if (signal?.aborted) { reject(aborted()); return; }
      const onAbort = (): void => {
        const i = this.queue.indexOf(entry);
        if (i < 0) return;
        this.queue.splice(i, 1);
        reject(aborted());
        this.pump();
      };
      const start = (): void => {
        signal?.removeEventListener('abort', onAbort);
        this.inFlight += b; this.running++; this.peak = Math.max(this.peak, this.inFlight);
        let p: Promise<T>;
        try { p = Promise.resolve(task()); } catch (e) { p = Promise.reject(e); }
        p.then(resolve, reject).finally(() => { this.inFlight -= b; this.running--; this.pump(); });
      };
      const entry = { bytes: b, start };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.queue.push(entry);
      this.pump();
    });
  }

  private pump(): void {
    while (this.queue.length) {
      const head = this.queue[0]!;
      if (this.running > 0 && this.inFlight + head.bytes > this.cap) return;
      this.queue.shift();
      head.start();
    }
  }
}

/** The manifest fields `hdLoadBytes` reads (an HD.R9 entry carries `placements`; one before HD.R9 has none). */
export type HdLoadEntry = Pick<HdEntry, 'key' | 'width' | 'height' | 'outWidth' | 'outHeight' | 'bytes' | 'placements'>;

/**
 * The bytes one key's `replacement()` holds at its peak, from the pack's manifest (an estimate, the budget's unit).
 * A key with no placements: its payload, its alpha-rescaled copy (`fullAlpha`, the composite) and the menus' turned
 * copy (`reverseRows`), 3 x its bytes. GM-13c: a key with HD.R9 placements is built one payload at a time
 * (`HdPackRuntime.build`), so it holds its largest payload and that payload's copy (the hash's, `texturePack.ts`
 * `sha256`), 2 x the largest entry's `bytes`, and its composite and the turned copy, 2 x the composite -- the
 * composite the runtime reserves (`hdKeyPeak`: the larger of the whole's size and the placements' scale,
 * agent/hd-subrect review F2), whatever the menus' scale. 0 for a key the pack does not name.
 */
export function hdLoadBytes(m: { entries: readonly HdLoadEntry[] }, key: string): number {
  let whole: HdLoadEntry | undefined, width = 0, height = 0;
  const placed: HdLoadEntry[] = [];
  for (const e of m.entries) {
    if (e.key !== key) continue;
    width = e.width; height = e.height;
    if (e.placements !== undefined) placed.push(e);
    else whole = e;
  }
  if (!width) return 0;
  if (!placed.length) return 3 * whole!.bytes;
  const peak = hdKeyPeak(width, height, whole, placed);
  return 2 * peak.payload + 2 * peak.composite;
}
