import { vi } from 'vitest';

/**
 * OVERLAY-CONSOLE's landing gate: the overlay's frame is made at its first open, never at the mount (the closed overlay
 * is inert, `../../src/modern/overlay/index`). A test that fits the frame's document before the console's first draw
 * (jsdom's missing layout, a spy on the frame's window) hands its fix here: it runs as the frame is put on the page --
 * the frame appended to `doc`'s body, its document there, before the sheets are copied and the console boots. Undone
 * with the test's `vi.restoreAllMocks()`.
 */
export function onOverlayFrame(fix: (inner: Document) => void, doc: Document = document): void {
  const body = doc.body;
  const append = body.append.bind(body);
  vi.spyOn(body, 'append').mockImplementation((...nodes: (Node | string)[]) => {
    append(...nodes);
    for (const n of nodes) if (n instanceof HTMLIFrameElement && n.classList.contains('mu-overlay-frame') && n.contentDocument) fix(n.contentDocument);
  });
}
