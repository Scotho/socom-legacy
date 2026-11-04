/** Browser adaptation: fullscreen on the menu and match, movable through the touch layout editor. */
export const FULLSCREEN_BUTTON_MARKUP = '<button id="fullscreen" class="s2u-fab mobile-fullscreen" type="button" aria-label="Enter fullscreen" title="Enter fullscreen"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4"/></svg></button>';

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void; webkitFullscreenEnabled?: boolean;
};
type FullscreenRoot = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

/**
 * Browser adaptation: the document's fullscreen, the one helper the touch button (`mountMobileFullscreen`), the test
 * room's button (`./ui` `onFullscreen`) and the match's START row (cq41E0VR, `./matchMount`) share. Each request is the
 * element's (standard, else webkit-prefixed) called on the element, each exit the document's called on the document --
 * never one side's call standing in for the other's.
 */
export interface DocumentFullscreen {
  /** A request can be made here: the element has one and the document does not refuse it (an iframe without the permission; an iPhone's Safari has none). */
  available(): boolean;
  active(): boolean;
  /** The element's request, called on it; null where it has none. A refusal rejects the promise. */
  request(): Promise<void> | null;
  /** The document's exit, called on it; null where it has none. */
  exit(): Promise<void> | null;
}

export function documentFullscreen(document: Document, element: HTMLElement = document.documentElement): DocumentFullscreen {
  const doc = document as FullscreenDocument, el = element as FullscreenRoot;
  const requestOf = (): (() => Promise<void> | void) | undefined => el.requestFullscreen ?? el.webkitRequestFullscreen;
  const exitOf = (): (() => Promise<void> | void) | undefined => doc.exitFullscreen ?? doc.webkitExitFullscreen;
  return {
    available: () => (doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled) !== false && !!requestOf(),
    active: () => !!(doc.fullscreenElement || doc.webkitFullscreenElement),
    request: () => { const f = requestOf(); return f ? Promise.resolve(f.call(el)) : null; },
    exit: () => { const f = exitOf(); return f ? Promise.resolve(f.call(doc)) : null; },
  };
}

/**
 * cq41E0VR (a browser adaptation): one press of the match's FULLSCREEN row. Leaving needs no user activation and never
 * reports; entering calls `refused` when no request could be made (none on the element, a thrown call) or the browser
 * rejected it (a pad's button is no user activation), so the row is never a silent failure.
 */
export function toggleFullscreen(fullscreen: DocumentFullscreen, refused: () => void): void {
  if (fullscreen.active()) {
    try { fullscreen.exit()?.catch(() => undefined); } catch { /* left as it is */ }
    return;
  }
  let request: Promise<void> | null;
  try { request = fullscreen.request(); } catch { request = null; }
  if (!request) { refused(); return; }
  request.catch(() => { refused(); });
}

export function mountMobileFullscreen(root: HTMLElement): () => void {
  // The test room already owns a fullscreen button and its binding (Ui.onFullscreen).
  if (root.querySelector('[id="fullscreen"]')) return () => {};
  const doc = root.ownerDocument as FullscreenDocument;
  const fullscreen = documentFullscreen(doc);
  const template = doc.createElement('template'); template.innerHTML = FULLSCREEN_BUTTON_MARKUP;
  const button = template.content.firstElementChild as HTMLButtonElement;
  const status = doc.createElement('p');
  status.dataset['fullscreenStatus'] = ''; status.className = 'mobile-fullscreen-status';
  status.setAttribute('role', 'status'); status.hidden = true;
  root.append(button, status);
  let disposed = false, pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const active = (): boolean => fullscreen.active();
  const update = (): void => {
    if (disposed) return;
    const label = active() ? 'Exit fullscreen' : 'Enter fullscreen';
    button.title = label; button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(active()));
  };
  const unavailable = (): void => {
    if (disposed) return;
    status.textContent = 'Fullscreen is not available in this browser right now.';
    status.hidden = false;
    clearTimeout(timer); timer = setTimeout(() => { status.hidden = true; }, 5000);
  };
  const toggle = async (): Promise<void> => {
    if (pending || disposed) return;
    pending = true; status.hidden = true;
    try {
      if (active()) {
        const exit = fullscreen.exit();
        if (!exit) { unavailable(); return; }
        await exit;
      } else {
        // Invoke directly from the tap so the browser's user activation is still valid.
        const request = fullscreen.request();
        if (!request) { unavailable(); return; }
        await request;
        if (disposed) return;
        const orientation = doc.defaultView?.screen.orientation as (ScreenOrientation & { lock?: (value: string) => Promise<void> }) | undefined;
        try { await orientation?.lock?.('landscape'); } catch { /* fullscreen is useful without a rotation lock */ }
      }
      update();
    } catch { unavailable(); }
    finally { pending = false; }
  };
  const click = (event: Event): void => { event.stopPropagation(); void toggle(); };
  button.addEventListener('click', click);
  doc.addEventListener('fullscreenchange', update);
  doc.addEventListener('webkitfullscreenchange', update);
  update();
  return () => {
    disposed = true; clearTimeout(timer);
    button.removeEventListener('click', click);
    doc.removeEventListener('fullscreenchange', update);
    doc.removeEventListener('webkitfullscreenchange', update);
    button.remove(); status.remove();
  };
}
