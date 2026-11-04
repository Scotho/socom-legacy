import type { AssetSource } from '@s2u/archive';

/**
 * The image the setup page opened, held for the modern UI (MU-4b / MU-5b of `docs/plans/2026-10-09-modern-ui-parallel.md`;
 * MU.R1, MU.R3). A browser adaptation: the page's wiring, nothing of the game.
 *
 * `../pageEntry` `offerDisc` publishes the asset source `openFrontEndImage` answered (`@s2u/archive`'s
 * `IsoAssetSource` over the visitor's image) once it has opened, and clears it when the next image is chosen or the
 * image is refused -- the same moments it tells the setup page `reading`, `ready` and `failed`. Nothing else of the
 * entry changes: the front end is still mounted at START over that same source, by the same call. Kept per document
 * (the entry's `doc`) so a test's document and the page's never share one. Read by `./launcherState` `assets()`,
 * which hands it out only while the setup page says `ready`; there is no other reader.
 *
 * Kept in a module of its own, with no reader in it, so the entry's chunk takes nothing of the modern UI's readers.
 */
const opened = new WeakMap<Document, AssetSource>();

/** The entry's one call: the image that opened, or null when the next is being read or was refused. */
export function publishDiscImage(doc: Document, source: AssetSource | null): void {
  if (source) opened.set(doc, source);
  else opened.delete(doc);
}

/** The image `doc`'s setup page last opened, or null. */
export function openedDiscImage(doc: Document): AssetSource | null {
  return opened.get(doc) ?? null;
}
