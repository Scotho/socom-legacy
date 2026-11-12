import { agentPresence, connectionNotes, createAgentActivity, observeTarget, type AgentActivityStore } from './activity';
import { createAgentConnection, type PageAgentTarget } from './connection';
import { createForgePageTarget } from './forgeTarget';
import { createLocalPackApi, type LocalDirectoryHandle, type LocalPackApi } from './localPacks';
import { mountAgentPanel, type AgentPanelController, type AgentPanelOptions } from './panel';
import { AGENT_STAGE_LEGEND, agentGatewayFor, agentGatewaySource, agentHealthOnShow, storedAgentGateway, type AgentStage } from './setup';
export { agentGatewaySource, storedAgentGateway } from './setup';
import { forgeMapPackDrivers } from './forgePacks';
import { viewerRev } from '../revision';
import type { ForgePadLegend, ForgePanel } from '../forge/shell/panel';
import { FORGE_CHIP_ORDER, type StatusChipView } from '../forge/shell/statusBar';

/** AX-16: what a capture asks of the canvas: `maxWidth` scales the picture down to that width (never up). */
export interface CaptureCanvasOptions { maxWidth?: number }
/**
 * Browser adaptation: capture only the rendered game canvas, after its next real draw. AX-16: `maxWidth` draws that
 * frame into a 2D canvas of that width (the aspect kept) and encodes it instead; a canvas already narrower, or a page
 * with no 2D context, is encoded as it is.
 */
export function captureGameCanvas(doc: Document, selector: string, options: CaptureCanvasOptions = {}): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = doc.querySelector<HTMLCanvasElement>(selector);
    if (!canvas || !canvas.width || !canvas.height || doc.visibilityState === 'hidden') { reject(new Error('CAPTURE_UNAVAILABLE')); return; }
    // Browser adaptation: a measured cold 1080x750 native PNG encode took 7.47 seconds.
    // Keep encoding bounded, with room remaining in the transport's 30-second command window.
    const timer = setTimeout(() => reject(new Error('CAPTURE_TIMEOUT')), 15_000);
    doc.defaultView!.requestAnimationFrame(() => {
      try { scaled(doc, canvas, options.maxWidth).toBlob(blob => { clearTimeout(timer); blob ? resolve(blob) : reject(new Error('CAPTURE_UNAVAILABLE')); }, 'image/png'); }
      catch (error) { clearTimeout(timer); reject(error); }
    });
  });
}

/** AX-16: the frame drawn into a 2D canvas `maxWidth` wide, in the same task as the draw; else the canvas itself. */
function scaled(doc: Document, canvas: HTMLCanvasElement, maxWidth: number | undefined): HTMLCanvasElement {
  if (maxWidth === undefined || canvas.width <= maxWidth) return canvas;
  const small = doc.createElement('canvas');
  small.width = Math.max(1, Math.floor(maxWidth));
  small.height = Math.max(1, Math.round((canvas.height * small.width) / canvas.width));
  const context = small.getContext('2d');
  if (!context) return canvas;
  context.drawImage(canvas, 0, 0, small.width, small.height);
  return small;
}

/** One ICE server URL without credentials, a query or a path: `stun:`, `turn:` or `turns:`, a host name, an optional port. */
const ICE_URL = /^(?:stun|turns?):[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::(\d{1,5}))?$/;

/**
 * Browser adaptation (the agent connection's deploy, GW-F-2): the build-time VITE_S2U_AGENT_ICE_SERVERS, a comma-separated
 * list of `stun:host:port` (`turn:`/`turns:` taken for later), one `{ urls }` each -- the gateway's FORGE_AGENT_ICE_SERVERS
 * grammar. Credentials are not supported: a URL with `@` or a query is refused. Unset or empty: none, as before.
 */
export function agentIceServers(value: string | undefined): RTCIceServer[] {
  if (value === undefined || value.trim() === '') return [];
  return value.split(',').map((entry) => {
    const url = entry.trim(), port = ICE_URL.exec(url)?.[1];
    if (!ICE_URL.test(url) || (port !== undefined && (Number(port) < 1 || Number(port) > 65535)))
      throw new Error(`INVALID_ICE_SERVERS: VITE_S2U_AGENT_ICE_SERVERS takes comma-separated stun:/turn:/turns: host[:port] URLs, without credentials or a query (got ${JSON.stringify(url)})`);
    return { urls: url };
  });
}

/** The build's environment as `import.meta.env` gives it. */
type BuildEnv = { readonly [key: string]: unknown; readonly DEV?: boolean };
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * The connection's settings: the gateway (VITE_S2U_AGENT_URL; else the page's own setting, LATER 423; else the loopback in
 * development, the page's origin otherwise) and its ICE servers (VITE_S2U_AGENT_ICE_SERVERS, GW-F-2; else none).
 */
export function agentConnectionSettings(doc: Document, env: BuildEnv = import.meta.env, stored: string | null = storedAgentGateway()): { gateway: string; iceServers: RTCIceServer[] } {
  return {
    gateway: agentGatewayFor(doc.location.origin, env, stored),
    iceServers: agentIceServers(text(env['VITE_S2U_AGENT_ICE_SERVERS'])),
  };
}

/**
 * The connection dock in `host`. Without `signal` it takes itself down at `pagehide` (the test room's); with one (a Forge
 * panel's, FUI-1) it goes with the signal, and the Forge's shell owns its lifecycle (the review's UX-12). FUI-4: given
 * an `activity` store, the target is watched into it (`observeTarget`), the connection's own lines join it once each, and
 * the dock's feed reads it; `controller` is the connection, for the page's agent chip. R4 (the UI seat's rulings to dot,
 * 2026-10-25 11:34Z / 11:41Z): `sharedPacks`, the packs are the page's -- this dock never disposes them; `openStaging`,
 * the page's one file chooser is elsewhere (the Forge's Assets panel) and the dock opens it instead of its own.
 */
export function mountPageAgent(doc: Document, target: PageAgentTarget, packs: LocalPackApi,
  subscribe: (listener: () => void) => () => void, host: HTMLElement, refresh: () => void, signal?: AbortSignal,
  extra: { activity?: AgentActivityStore; sharedPacks?: boolean; openStaging?: () => void; onStage?: (stage: AgentStage) => void;
    agentRun?: Pick<AgentPanelOptions, 'undoAgentRun' | 'agentChanges'>; lastPoint?: AgentPanelOptions['lastPoint'] } = {}): { dispose(): void; controller: AgentPanelController } {
  const { activity, sharedPacks = false, openStaging, onStage, agentRun, lastPoint } = extra;
  const settings = agentConnectionSettings(doc);
  const connection = createAgentConnection({ ...settings, target: activity ? observeTarget(target, activity) : target, document: doc });
  const ingest = activity ? connectionNotes(activity) : null;
  const offNotes = ingest ? connection.subscribe((state) => ingest(state.activity)) : () => undefined;
  const picker = (doc.defaultView as (Window & { showDirectoryPicker?: (options: { mode: 'read' }) => Promise<LocalDirectoryHandle> }) | null)?.showDirectoryPicker;
  const panel = mountAgentPanel(host, connection, {
    ...(picker ? { chooseDirectory: async () => {
      const directory = await picker.call(doc.defaultView, { mode: 'read' });
      packs.setDirectory(directory); return directory.name;
    } } : {}),
    ...(openStaging ? { openStaging } : { stageFiles: async (files: File[]) => { await packs.stage(files); refresh(); } }),
    ...(activity ? { activity } : {}),
    ...(onStage ? { onStage } : {}),
    ...(agentRun ?? {}),
    ...(lastPoint ? { lastPoint } : {}),
    gateway: settings.gateway,
    gatewaySource: agentGatewaySource(),
    healthOnShow: agentHealthOnShow(),
  });
  const unsubscribe = subscribe(() => connection.refresh());
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return; disposed = true;
    unsubscribe(); offNotes(); connection.dispose(); panel.dispose();
    if (!sharedPacks) packs.dispose();
    if (!signal) doc.defaultView?.removeEventListener('pagehide', dispose);
  };
  if (signal) signal.addEventListener('abort', dispose, { once: true });
  else doc.defaultView?.addEventListener('pagehide', dispose);
  return { dispose, controller: connection };
}

/** R5-B (a browser adaptation): the agent chip's word while an agent camera shot runs, and its one action's label. */
export const AGENT_SHOT_CHIP: StatusChipView = { text: 'Camera shot', tone: 'live' };
export const AGENT_SHOT_STOP = 'Stop camera';

/** R4: the Assets panel's id (dot's `../creator/assetsForgePanel`), the page's one file chooser the dock opens. */
export const FORGE_ASSETS_PANEL_ID = 'creator-assets';

/**
 * FUI-1 (FUI.R3: the agent dock ships in release, pad-reachable; a browser adaptation, FG.R2): "Connect your agent" as a
 * registered Forge panel -- in the right dock after Settings, folded until opened, with a START row that shows it (FUI-11
 * gives it its pad route inside). The shell disposes it with the page. FUI.R5: in a dock past five panels it is the
 * "Agent" tab (a label of its own, so the tab is never a second "Connect your agent" beside the panel's summary).
 * R4: given the page's `packs` (`ForgePageServices`), the dock uses that one instance -- the Assets panel's too -- and
 * never disposes it (closing the dock leaves a staged file staged); its own file chooser gives way to the Assets panel's
 * (`openStaging` reveals it). Without them it makes and disposes its own, as before.
 */
/**
 * FP-14 (FP.R10): the panel's declaration, its id, dock, order and tab unchanged so a saved layout keeps it. The shell's
 * `builtPanel` takes a body built before the mount; this one needs the mount's context (the page's API, signal and
 * status chip), so it keeps its own `mount` beside the same declaration. A browser adaptation, FG.R2.
 */
export const AGENT_PANEL_DECLARATION = { id: 'agent', title: 'Connect your agent', dock: 'right', order: 50, defaultOpen: false, tab: 'Agent' } as const;
/** FP-14 (AX-U: a moment's): the pad prompts in the shell's names (the d-pad's one name). */
export function agentStagePadLegend(stage: AgentStage): ForgePadLegend[] {
  return AGENT_STAGE_LEGEND[stage].map(p => ({ button: p.glyph === 'dpad-v' ? 'dpad' : p.glyph, label: p.label }));
}

export function forgeAgentPanel(options: { packs?: LocalPackApi } = {}): ForgePanel {
  let reveal: ((id: string) => void) | null = null;
  return {
    ...AGENT_PANEL_DECLARATION,
    // FP-14 fold N2: the shell does not read `padLegend` yet (the card draws its own prompts); kept for a future shell.
    padLegend: agentStagePadLegend('connect'),
    menuSection: () => [{ id: 'agent', label: 'Agent', heading: true },
      { id: 'panel-agent', label: 'Connect your agent', note: 'Your agent builds with you · ✕ shows the connection in the dock', act: () => reveal?.('agent') }],
    mount(host, ctx) {
      const { doc } = ctx, api = ctx.forge;
      reveal = (id) => ctx.ui.reveal(id);
      const shared = options.packs;
      const packs = shared ?? createLocalPackApi(forgeMapPackDrivers(api));
      const target = createForgePageTarget({ api, build: viewerRev() || 'forge-agent-v1', packs,
        capture: (o) => captureGameCanvas(doc, doc.querySelector('.fx-match:not([hidden]) canvas') ? '.fx-match:not([hidden]) canvas' : '.fx-canvas', o) });
      // FUI-4 (VP-5, AI-2's page half, AI-15): one activity store; the agent's chip in the status bar, beside the match's
      // Back during Play, with a one-press Stop while connected; an approval or a failure said at page level, docks or no.
      // AX-15: the rows know their history step (the page's undo), and the dock's "Undo the agent's changes".
      const editor = ctx.editor;
      const history = editor?.historyTop && editor.undoWhile ? { top: () => editor.historyTop!(), undoWhile: editor.undoWhile.bind(editor),
        subscribe: (listener: () => void) => api.subscribe(() => listener()) } : undefined;
      const activity = createAgentActivity(history ? { history } : {});
      const agentRun = editor?.undoAgentRun ? { undoAgentRun: () => editor.undoAgentRun!(),
        agentChanges: () => ({ count: editor.agentStepCount?.() ?? 0, undoable: editor.historyTop?.()?.actor.kind === 'agent' }) } : undefined;
      // AX-13: the dock's line naming the point the agent can read (`forge.focus`), repainted as the editor tells.
      const lastPoint = api.focus ? { read: () => api.focus?.()?.point ?? null, subscribe: (listener: () => void) => api.subscribe(() => listener()) } : undefined;
      const page = mountPageAgent(doc, target, packs, listener => api.subscribe(listener), host, () => api.refreshExternalState(), ctx.signal,
        { activity, ...(agentRun ? { agentRun } : {}), ...(lastPoint ? { lastPoint } : {}), ...(shared ? { sharedPacks: true, openStaging: () => ctx.ui.reveal(FORGE_ASSETS_PANEL_ID) } : {}) });
      // R5-B (a browser adaptation): while the agent's camera shot runs the chip says so, and its one action stops the
      // camera (the shot ends `stopped`; the connection stays); the Stop that disconnects comes back once it ends.
      const shooting = (): boolean => api.shotRunning?.() === true;
      const presence = () => (shooting() ? AGENT_SHOT_CHIP : agentPresence(page.controller.state().status, activity.acting()));
      const chip = ctx.ui.registerStatusChip({
        id: 'agent', order: FORGE_CHIP_ORDER.agent, inMatch: true,
        text: () => presence().text, tone: () => presence().tone,
        title: () => `${presence().text ?? 'Agent'} · open Connect your agent`,
        onOpen: () => ctx.ui.reveal('agent'),
        action: () => (shooting() ? { label: AGENT_SHOT_STOP, run: () => { api.stopShot?.(); chip.update(); } }
          : page.controller.state().status === 'connected' ? { label: 'Stop', run: () => page.controller.disconnect() } : null),
      });
      let was = page.controller.state().status, said = page.controller.state().error;
      const offState = page.controller.subscribe((state) => {
        chip.update();
        if (state.status === 'approval' && was !== 'approval') ctx.ui.notify('Your agent asks for access: answer in Connect your agent', { kind: 'toast', source: 'agent' });
        if (state.error && state.error !== said) ctx.ui.notify(state.error, { kind: 'error', source: 'agent' });
        was = state.status; said = state.error;
      });
      const offActivity = activity.subscribe(() => chip.update());
      return { dispose() { offState(); offActivity(); chip.remove(); page.dispose(); activity.dispose(); reveal = null; } };
    },
  };
}
