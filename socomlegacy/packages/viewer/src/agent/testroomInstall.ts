import { subscribeSoloAgentApi } from '../testroom/agent/host';
import { createLocalPackApi } from './localPacks';
import { captureGameCanvas, mountPageAgent } from './install';
import { createTestroomPageTarget } from './testroomTarget';

/** Mounted only by the /testroom page loader; ordinary game and replay loaders never import it. */
export function mountTestroomAgent(doc: Document): { dispose(): void } {
  const dock = doc.createElement('details'); dock.className = 'agent-testroom-dock';
  const title = doc.createElement('summary'); title.textContent = 'Connect your agent'; dock.append(title);
  // The owner (2026-10-30): at the bottom of the test room's settings panel (`setup/index.html` `#panel-body`), after
  // what it already holds; a page without that panel keeps the floating dock on the body.
  const settings = doc.getElementById('panel-body');
  // Sections appended to the panel later (the model pack's, a dev build's taunt editor) go above it: the dock re-appends.
  let keepLast: MutationObserver | undefined;
  if (settings) {
    dock.classList.add('agent-testroom-dock--in-panel'); settings.append(dock);
    const View = doc.defaultView?.MutationObserver;
    if (View) { keepLast = new View(() => { if (dock.isConnected && settings.lastElementChild !== dock) settings.append(dock); }); keepLast.observe(settings, { childList: true }); }
  } else doc.body.append(dock);
  let page: { dispose(): void } | undefined;
  let unsubscribeMode: (() => void) | undefined;
  const unsubscribe = subscribeSoloAgentApi(api => {
    page?.dispose(); page = undefined; unsubscribeMode?.(); unsubscribeMode = undefined;
    if (!api) { dock.hidden = true; return; }
    // Browser adaptation: the dock is the SOLO room's; an online match or a replay on this page never shows it.
    const solo = (): boolean => api.read().mode === 'testroom-solo';
    dock.hidden = !solo();
    unsubscribeMode = api.subscribe(() => { dock.hidden = !solo(); });
    const packs = createLocalPackApi({ ...api.localPacks, allowedSurface: kind => kind !== 'map' && api.read().mode === 'testroom-solo' && api.read().buildAllowed });
    const target = createTestroomPageTarget(api, packs, () => captureGameCanvas(doc, '#view'));
    page = mountPageAgent(doc, target, packs, listener => api.subscribe(listener), dock, () => api.refreshExternalState());
  });
  return { dispose() { keepLast?.disconnect(); unsubscribe(); unsubscribeMode?.(); page?.dispose(); dock.remove(); } };
}
