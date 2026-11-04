/**
 * MU2-10 (MU2-9's finding (b); the controller's run of `e2e/modernProfile.spec.ts` and `e2e/modernLobbies.spec.ts` at
 * c8cf6ee4d): the window whose address the modern sections build their requests from. A section mounted in the page's
 * own document reads that document's window, as before; a section mounted in the overlay's frame (`./overlay`, an
 * `about:blank` document over the page) reads the page's, which the overlay adopts for its document here -- the frame's
 * own `location.origin` is `"null"`, and a base built from it sent every section's request to
 * `<page origin>/null/<route>` while the session (made over the page's window) asked the right one. One truth with the
 * console's adapters, which read the page's window too. A browser adaptation's wiring (MU.R1): nothing of the game.
 */

const adopted = new WeakMap<Document, Window>();

/** `doc`'s requests are built from `page`'s address from now on (the overlay's frame); answers the undo. */
export function adoptPageWindow(doc: Document, page: Window): () => void {
  adopted.set(doc, page);
  return () => { if (adopted.get(doc) === page) adopted.delete(doc); };
}

/** The window whose `location` `doc`'s requests are built from: the adopted page's, else `doc`'s own, else the global. */
export function pageWindow(doc: Document): Window {
  return adopted.get(doc) ?? doc.defaultView ?? window;
}
