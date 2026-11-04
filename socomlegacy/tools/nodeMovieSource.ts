import type { AssetSource } from '@s2u/archive';
import { MOVIE_END, MOVIE_PENDING, demuxPssFile, type MovieDecoder, type MovieNext, type MoviePictureSource, type MovieOpenOptions, type MovieResult } from '@s2u/fmv';

/** A presented picture: its index and its RGBA (the IPU's conversion, top row first). */
export interface NodeMovieFrame { index: number; width: number; height: number; rgba: Uint8Array }

/**
 * PLAT-21's picture source over the page's decoder core, for Node (BOOT-04's, moved here from
 * `test/introShellDisc.test.ts` by BOOT-06 so that a second disc test can use it): `prime` decodes the next picture
 * ahead of a tick (the worker's queue), `next` hands it over or says pending; a second open resets the one engine
 * (research 120 §2). `restart` throws: no dialog on the disc loops (research 121 §5, research 141 §1).
 */
export class NodeMovieSource implements MoviePictureSource<NodeMovieFrame> {
  private ready: MovieResult | null = null;
  private ended = true;
  private index = 0;
  readonly opened: string[] = [];
  constructor(private readonly decoder: MovieDecoder, private readonly source: AssetSource, private readonly exists: (p: string) => boolean) {}
  private path(name: string): string { return name.replace(/\\/g, '/').replace(/^\/+/, '').toUpperCase(); }
  open(name: string, _o: MovieOpenOptions): boolean {
    const p = this.path(name);
    if (!this.exists(p)) return false;
    this.decoder.open(demuxPssFile(this.source, p));
    this.ready = null; this.ended = false; this.index = 0;
    this.opened.push(p);
    return true;
  }
  async prime(): Promise<void> { if (!this.ended && !this.ready) this.ready = await this.decoder.next(); }
  next(): MovieNext<NodeMovieFrame> {
    if (this.ended) return MOVIE_END;
    if (!this.ready) return MOVIE_PENDING;
    const r = this.ready;
    this.ready = null;
    if (r.kind === 'end') { this.ended = true; return MOVIE_END; }
    const p = r.picture;
    return { index: this.index++, width: p.width, height: p.height, rgba: p.data };
  }
  restart(): void { throw new Error('no dialog loops (research 121 §5)'); }
  close(): void { this.ended = true; this.ready = null; }
}
