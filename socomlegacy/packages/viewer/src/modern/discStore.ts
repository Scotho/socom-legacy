import type { AssetSource } from '@s2u/archive';
import { openedDiscImage } from './discImage';

/**
 * The disc's state for the modern UI, held apart from the setup page's DOM (OV-1 of the modern-UI plan; the brief
 * `docs/plans/briefs/modern-ui-live-site-scope.md` 4.1; MU.R23 (4): no section depends on the setup page's DOM). A
 * browser adaptation (MU.R1): the page's wiring, nothing of the game.
 *
 * Its writers are the two that already hold the facts: `../startup` `Startup.sync` publishes the state it writes to
 * the setup page (`empty`, `reading`, `ready`, `error`) with the chosen image's name (`Startup.reading`), and
 * `../pageEntry` `offerDisc` publishes `in-game` once START has taken the setup page down and mounted the front end
 * over the opened image -- the disc is still in, the front end has the window. The opened image itself stays where
 * `offerDisc` already publishes it (`./discImage`), read here as the snapshot's `image`. Kept per document (as
 * `./discImage`), so a test's document and the page's never share one; a document nothing was published for reads
 * `empty`. Its one reader is `./launcherState`, the sections' read-only view.
 *
 * Kept free of the readers (`./discAssets`) and of the modern UI's chunk, so the entry and the setup page take only
 * this small module.
 *
 * MU2-7 (CX.R5: what the modern UI says of the disc is what the readers report): a refusal may carry the reader's own
 * words (`refusal`, the message `openFrontEndDisc` refused with -- the words the console's Disc line and the game page's
 * line say), kept while the state is `error` and dropped with it. A writer that passes none leaves none: no words are
 * made up here. Nothing is stored: the page's memory, per Document, as the rest.
 */
export type DiscStoreState = 'empty' | 'reading' | 'ready' | 'error' | 'in-game';

export interface DiscSnapshot {
  state: DiscStoreState;
  /** The chosen image's file name; null before one is chosen. */
  filename: string | null;
  /** The opened image (`./discImage`), or null. */
  image: AssetSource | null;
  /** MU2-7: the reader's own words for the refusal while the state is `error` and the writer gave them; else null. */
  refusal: string | null;
}

interface Held { state: DiscStoreState; filename: string | null; refusal: string | null; subs: Set<(s: DiscSnapshot) => void> }
const held = new WeakMap<Document, Held>();
const of = (doc: Document): Held => {
  let h = held.get(doc);
  if (!h) { h = { state: 'empty', filename: null, refusal: null, subs: new Set() }; held.set(doc, h); }
  return h;
};

/** The disc as last published for `doc`. */
export function readDisc(doc: Document): DiscSnapshot {
  const h = held.get(doc);
  return { state: h?.state ?? 'empty', filename: h?.filename ?? null, image: openedDiscImage(doc), refusal: h?.refusal ?? null };
}

/**
 * A writer's one call: the state, and the file name when it is known (absent: kept); with `error`, the reader's words
 * when the writer has them (MU2-7; any other state has none). Each subscriber hears a change of any of them once; a
 * publish that changes nothing is not heard (`Startup.sync` publishes on every sync).
 */
export function publishDisc(doc: Document, next: { state: DiscStoreState; filename?: string | null; refusal?: string | null }): void {
  const h = of(doc);
  const filename = next.filename === undefined ? h.filename : next.filename;
  const refusal = next.state === 'error' && next.refusal ? next.refusal : null;
  if (h.state === next.state && h.filename === filename && h.refusal === refusal) return;
  h.state = next.state;
  h.filename = filename;
  h.refusal = refusal;
  const snap = readDisc(doc);
  for (const cb of [...h.subs]) if (h.subs.has(cb)) cb(snap);   // one unsubscribed by an earlier one is not called
}

/** Calls `cb` on each change; answers the unsubscribe. */
export function onDiscChange(doc: Document, cb: (s: DiscSnapshot) => void): () => void {
  const h = of(doc);
  h.subs.add(cb);
  return () => { h.subs.delete(cb); };
}
