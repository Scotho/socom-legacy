/**
 * The launcher's ISO state, read only, for the modern UI (MU-1; MU.R3: "the home page's bottom bar (the ISO insertion
 * and launch status) stays on the modern tab", and every ISO-gated control reads it). A browser adaptation (MU.R1).
 *
 * Since OV-1 (the brief `docs/plans/briefs/modern-ui-live-site-scope.md` 4.1; MU.R23 (4): no section depends on the
 * setup page's DOM) it reads the disc store (`./discStore`), not the setup page: `../startup` `Startup.sync` publishes
 * there the state it shows (`empty`, `reading`, `ready`, `error`) and the image's name (`Startup.reading`), and
 * `../pageEntry` `offerDisc` publishes `in-game` once START has mounted the front end (the disc is still in; before
 * OV-1 the view read `empty` then). `ready` is a disc that opened (the console's disc adapter, `../console/adapters/disc`,
 * publishes it; `offerDisc` goes on to `in-game`): the only state from which it can be launched; since MU2-7 the ISO
 * counts as inserted in `ready` and `in-game` alike (below). No setter is offered; the writers are the store's.
 *
 * `assets()` (MU-4b / MU-5b) is the opened image's readers (`./discAssets`): the source `../pageEntry` `offerDisc`
 * publishes (`./discImage`) once the image has opened, handed out only while the disc is in, else null.
 *
 * MU2-7 (CX.R5, MU2.R6: one truth with the console's disc adapter, `../console/adapters/disc` `liveDisc`): the disc is in
 * while the store says `ready` or `in-game` -- the console reads `in-game` as `ready` (the disc is still in; the front end
 * has the window), so the overlay over a running game reads the disc as in too, and its readers stay handed out. The
 * opened disc's facts are the opened request's (`../discPrompt` `openedDiscRequest`, the one the console's START hands
 * on): `kind()` an image or a folder, `label()` its words as the console's Disc line says them (`../discSource`
 * `discLabel`: `the disc image <file>`, `the disc folder <name>`); `refusal()` the reader's own words the store holds
 * for an `error` (`./discStore`). None of them is a second reader, and none is new wording.
 */
import { openedDiscRequest } from '../discPrompt';
import { discLabel } from '../discSource';
import { discAssetsOf, type DiscAssets } from './discAssets';
import { onDiscChange, readDisc, type DiscStoreState } from './discStore';

export type DiscState = DiscStoreState;

export interface LauncherSnapshot {
  disc: DiscState;
  isoInserted: boolean;
  filename: string | null;
}

export interface LauncherState {
  /** The disc's state as the setup page shows it; `in-game` once START has mounted the front end. */
  disc(): DiscState;
  /** Whether the disc is in: open (`ready`) or under the running game (`in-game`), as the console's disc adapter reads it. */
  isoInserted(): boolean;
  /** The chosen image's file name, or null before one is chosen. */
  filename(): string | null;
  /**
   * The opened image's readers while the disc is `ready` (`./discAssets`), else null. Optional: a view with no image
   * behind it (a test's fake) has none, and every ISO-gated control then stays locked.
   */
  assets?(): DiscAssets | null;
  /** MU2-7: the disc in's kind -- an image or a folder (the opened request's) -- else null. Optional: a test's fake has none. */
  kind?(): 'image' | 'folder' | null;
  /** MU2-7: the disc in as the console's Disc line names it (`discLabel`), else ''. Optional: a test's fake has none. */
  label?(): string;
  /** MU2-7: the reader's own words for an `error` (the store's), else ''. Optional: a test's fake has none. */
  refusal?(): string;
  /** Calls `cb` once per change of the disc's state; answers the unsubscribe. */
  onChange(cb: (s: LauncherSnapshot) => void): () => void;
}

export function launcherState(doc: Document = document): LauncherState {
  const disc = (): DiscState => readDisc(doc).state;
  const discIn = (): boolean => { const s = disc(); return s === 'ready' || s === 'in-game'; };
  const filename = (): string | null => (disc() === 'empty' ? null : readDisc(doc).filename);
  const snapshot = (): LauncherSnapshot => ({ disc: disc(), isoInserted: discIn(), filename: filename() });
  /** The request the disc in was opened from: only with the disc in and its source published (else none is open). */
  const opened = (): ReturnType<typeof openedDiscRequest> => (discIn() && readDisc(doc).image ? openedDiscRequest() : null);
  return Object.freeze({
    disc,
    isoInserted: discIn,
    filename,
    assets(): DiscAssets | null {
      const now = readDisc(doc);
      if (!discIn()) return null;
      return now.image ? discAssetsOf(now.image) : null;
    },
    kind(): 'image' | 'folder' | null {
      const r = opened();
      return r ? (r.kind === 'dir' ? 'folder' : 'image') : null;
    },
    label(): string {
      const r = opened();
      return r ? discLabel(r) : '';
    },
    refusal(): string {
      const now = readDisc(doc);
      return now.state === 'error' ? now.refusal ?? '' : '';
    },
    onChange(cb: (s: LauncherSnapshot) => void): () => void {
      let last = disc();
      return onDiscChange(doc, () => {
        const now = disc();
        if (now === last) return;                     // a change of the name alone is not the disc's state
        last = now;
        cb(snapshot());
      });
    },
  });
}
