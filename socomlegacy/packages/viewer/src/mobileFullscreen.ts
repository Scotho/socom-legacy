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
  const requestOf = (): (() => Promise<void> | void) | undefined => {
    if (doc.fullscreenEnabled !== false && el.requestFullscreen) return el.requestFullscreen;
    if (doc.webkitFullscreenEnabled !== false && el.webkitRequestFullscreen) return el.webkitRequestFullscreen;
    return undefined;
  };
  const exitOf = (): (() => Promise<void> | void) | undefined => doc.webkitFullscreenElement && !doc.fullscreenElement
    ? doc.webkitExitFullscreen ?? doc.exitFullscreen : doc.exitFullscreen ?? doc.webkitExitFullscreen;
  return {
    available: () => !!requestOf(),
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

/** One activation path for the menu/match control and the existing test-room button in every build. */
export function bindFullscreenButton(button: HTMLButtonElement): () => void {
  const doc = button.ownerDocument;
  const fullscreen = documentFullscreen(doc);
  const status = doc.createElement('p');
  status.dataset['fullscreenStatus'] = ''; status.className = 'mobile-fullscreen-status';
  status.setAttribute('role', 'status'); status.hidden = true;
  button.parentElement?.append(status);
  let disposed = false, pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const update = (): void => {
    if (disposed) return;
    const active = fullscreen.active();
    const label = active ? 'Exit fullscreen' : 'Enter fullscreen';
    button.title = label; button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(active));
    if (active) status.hidden = true;
  };
  const unavailable = (): void => {
    if (disposed) return;
    status.textContent = fullscreen.available()
      ? 'Fullscreen was blocked. Tap this button to try again, or open this build directly in your browser.'
      : 'Page fullscreen is not available in this browser. If it offers Add to Home Screen, open the game from there for an app view.';
    status.hidden = false;
    clearTimeout(timer); timer = setTimeout(() => { status.hidden = true; }, 7000);
  };
  const toggle = async (): Promise<void> => {
    if (pending || disposed) return;
    pending = true; status.hidden = true;
    try {
      if (fullscreen.active()) {
        const exit = fullscreen.exit();
        if (!exit) { unavailable(); return; }
        await exit;
      } else {
        // No timer, frame, dynamic import or orientation request before the native request:
        // it must consume the tap's user activation in this same event handler.
        const request = fullscreen.request();
        if (!request) { unavailable(); return; }
        await request;
        if (disposed) return;
        const orientation = doc.defaultView?.screen.orientation as (ScreenOrientation & { lock?: (value: string) => Promise<void> }) | undefined;
        // Rotation is optional. A browser may leave its promise pending; it must never lock the button.
        try { void orientation?.lock?.('landscape')?.catch(() => undefined); } catch { /* fullscreen works without a rotation lock */ }
      }
      update();
    } catch { unavailable(); }
    finally { pending = false; }
  };
  const stopPointer = (event: Event): void => { event.stopPropagation(); };
  const click = (event: MouseEvent): void => {
    event.preventDefault(); event.stopPropagation();
    void toggle();
  };
  button.addEventListener('pointerdown', stopPointer);
  button.addEventListener('click', click);
  doc.addEventListener('fullscreenchange', update);
  doc.addEventListener('webkitfullscreenchange', update);
  update();
  return () => {
    disposed = true; clearTimeout(timer);
    button.removeEventListener('pointerdown', stopPointer);
    button.removeEventListener('click', click);
    doc.removeEventListener('fullscreenchange', update);
    doc.removeEventListener('webkitfullscreenchange', update);
    status.remove();
  };
}

export function mountMobileFullscreen(root: HTMLElement): () => void {
  // The test room's existing button is bound by Ui.onFullscreen with the same handler.
  if (root.querySelector('[id="fullscreen"]')) return () => {};
  const template = root.ownerDocument.createElement('template'); template.innerHTML = FULLSCREEN_BUTTON_MARKUP;
  const button = template.content.firstElementChild as HTMLButtonElement;
  root.append(button);
  const unbind = bindFullscreenButton(button);
  return () => { unbind(); button.remove(); };
}
