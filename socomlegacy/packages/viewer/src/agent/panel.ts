import './panel.css';
import { pageSettings } from '../pageStore';
import type { AgentActivityStore } from './activity';
import { drawLegend } from '../forge/shell/legend';
import { LIMITS, type Diagnosis } from '@s2u/forge-agent-protocol';
import { AGENT_DIAGNOSIS, AGENT_DOCTOR_ACTIONS, AGENT_HEALTH_WORDS, agentCodeWords, agentRouteDetails } from './codes';
import {
  AGENT_ALLOW_LABEL, AGENT_AUTHORIZE_WORDS, AGENT_CLIENT_NOTES, AGENT_CLIENTS, AGENT_COPY_LINK_LABEL, AGENT_GATEWAY_KEY, AGENT_STAGE_LEGEND,
  AGENT_STAGES, agentClientPaired, agentEndpoint, agentSetupRows, agentStageError, agentStageFor, lastPairedAgentClient, rememberAgentClientPaired,
  safeGateway, type AgentClient, type AgentGatewaySource, type AgentStage,
} from './setup';
import {
  findRememberedAgent, forgetRememberedAgent, matchedById, rememberAgent, rememberedAgents, type AgentIdentity, type RememberedAgent,
} from './remembered';

/** Browser adaptation: explicit page consent and a visible, revocable agent connection. */
export type { AgentClient } from './setup';
export type AgentPermission = 'inspect' | 'edit' | 'import' | 'test' | 'diagnose' | 'capture';
export interface AgentPanelState {
  status: 'idle' | 'creating' | 'waiting' | 'approval' | 'connecting' | 'connected' | 'paused' | 'disconnected' | 'error';
  target: string;
  /** Browser adaptation: public invitation deadline only, never a token or session lifetime. */
  expiresAt?: number;
  permissions: readonly AgentPermission[];
  /** AX-10: `gatewayClientId`, the gateway's OAuth client id when it sent one (additive), matches a remembered agent. */
  pending?: { clientName: string; comparisonCode: string; permissions: readonly AgentPermission[]; gatewayClientId?: string };
  error?: string;
  activity: readonly { text: string; kind: 'success' | 'error' | 'info' }[];
  /** AX-8 (AX.R4; a browser adaptation): the tab is hidden -- the pairing kept, new test work refused `PAGE_HIDDEN`. */
  hidden?: boolean;
  /**
   * AX-12 (the connection doctor; a browser adaptation): why the last connection failed or ended from the other side --
   * one class, and for a failed route the candidate counts (never an address). Absent after the player's own Disconnect.
   */
  diagnosis?: Diagnosis;
  /**
   * AX-9 (a browser adaptation): this tab reloaded holding a resume ticket -- the Connect moment offers "Reconnect <client>".
   * REVIEW-1 finding 7 (AX.R2): `permissions`, the grants Reconnect will give back, drawn on the card before the click.
   */
  resume?: { clientName: string; permissions: readonly AgentPermission[] };
  /** AX-14 (a browser adaptation): the notes this pairing sent the agent, oldest first; they end with the pairing. */
  notes?: readonly AgentPanelNote[];
}
/** AX-14: a note the player sent -- `sent` until the agent has read it (`delivered`), or `refused` with its code. */
export interface AgentPanelNote {
  id: string;
  text: string;
  state: 'sent' | 'delivered' | 'refused';
  code?: string;
}
/** AX-14: the note box's words (its HTML placeholder; not a parity *_PLACEHOLDER -- REVIEW-1 finding 2). */
export const AGENT_NOTE_PROMPT = 'Tell your agent…';
export const AGENT_NOTE_DELIVERED = 'delivered';
/**
 * AX-8: the status line of a connected pairing while its tab is hidden (AX-U owns the dock's look). AX.R4: a hide cancels
 * what ran and nothing resumes by itself (REVIEW-1 finding 15).
 */
export const AGENT_HIDDEN_NOTE = 'Paused while this tab is hidden: come back to run tests again.';
export interface AgentPanelController {
  state(): AgentPanelState;
  subscribe(listener: (state: AgentPanelState) => void): () => void;
  prepare(client: AgentClient): Promise<string>;
  approve(permissions: AgentPermission[]): void;
  deny(): void;
  disconnect(): void;
  /** AX-12: one cheap `GET /health` of the connection service; the Connect moment runs it on its first showing (mount, or a folded host's first opening) and on Retry. */
  health?(): Promise<'ready' | 'unreachable'>;
  /** AX-9: the player pressed "Reconnect <client>": re-bind the pairing the reload left resumable. */
  reconnect?(): Promise<void>;
  /** AX-9: the player chose to connect afresh: forget the held ticket. */
  forgetResume?(): void;
  /**
   * AX-14: send the agent a note (plain text, at most `LIMITS.noteChars` characters). The refusal's code when it is not
   * sent (not connected, empty, too long, too soon or too many waiting); nothing when it is.
   */
  sendNote?(text: string): string | undefined;
}
export interface AgentPanelOptions {
  copy?: (text: string) => Promise<void>;
  chooseDirectory?: () => Promise<string | void>;
  stageFiles?: (files: File[]) => Promise<void>;
  /**
   * R4 (one chooser; a browser adaptation): the page's file chooser lives in another panel (the Forge's Assets panel);
   * given, the dock shows a button that opens it in place of its own file input (`stageFiles` then unused).
   */
  openStaging?: () => void;
  /**
   * FUI-4 (AI-15's store, AI-3's words): the typed activity store (`./activity`). Given, the feed reads it -- each row's
   * words through the code table (`./codes`), its code kept as `data-agent-code` -- in place of the connection's ring.
   */
  activity?: AgentActivityStore;
  /** FP-14: the connection service's address, its /mcp URL in the setup commands (the page's origin when absent). */
  gateway?: string;
  /** LATER 423 (FP-14): where `gateway` came from; the build's is shown, not editable (default: 'default'). */
  gatewaySource?: AgentGatewaySource;
  /** AX-12: whether the first showing checks `/health` (`./setup` `agentHealthOnShow`; default true); false: only a Retry. */
  healthOnShow?: boolean;
  /** AX-U: the moment the card shows (Connect, Allow, Connected), called when it changes and once at mount. */
  onStage?: (stage: AgentStage) => void;
  /**
   * AX-15 (a browser adaptation, FG.R2): "Undo the agent's changes" -- the page's undo of the agent's steps on top of the
   * history (`../forge/history` `undoAgentRun`); its words said under the button. Given, the connected state's activity
   * shows the one `data-agent-undo-run` button.
   */
  undoAgentRun?: () => { undone: number; message: string } | void;
  /** AX-15: the agent's steps still in the history, and whether the top one is the agent's (the button's enabled state). */
  agentChanges?: () => { count: number; undoable: boolean };
  /**
   * AX-13 (plan item 13, a browser adaptation): the point the agent can read with `forge.focus` -- the world point under
   * the player's last click (null before one) -- and how to hear that it moved. Given, the connected moment says so in one
   * line with the point rounded, so the player knows what they share.
   */
  lastPoint?: { read(): readonly [number, number, number] | null; subscribe?(listener: () => void): () => void };
}
/** AX-13: the connected moment's line naming what the agent can see of the player's pointing. */
export const AGENT_FOCUS_LINE = 'Your agent can see where you last clicked';
/** FUI-25 (FUI.R25; a browser adaptation): the labels, whose key order is the order every grant list shows. */
export const PERMISSION_LABELS: Record<AgentPermission, string> = {
  inspect: 'Read this session', edit: 'Edit the map', import: 'Import local packs', test: 'Run tests',
  diagnose: 'Read diagnostics', capture: 'See the game canvas',
};
/**
 * AX-U (AX.R2; a browser adaptation): each permission's one line of what it lets the agent do, from the operations the
 * protocol files under it (`@s2u/forge-agent-protocol` `OPERATIONS`, each operation's `permission`).
 */
export const PERMISSION_DETAILS: Record<AgentPermission, string> = {
  inspect: 'See the map, its pieces and what this page is showing.',
  edit: 'Place, move and remove pieces, with undo and redo.',
  import: 'Bring in layouts, rules and the local packs you add here.',
  test: 'Start Play, move the player and run tests on this page.',
  diagnose: 'Check the layout and read placement diagnostics.',
  // REVIEW-2 14: what the agent is told too (the manual's target.capture): a preset moves the camera and restores it,
  // and a running shot ends first.
  capture: 'Take pictures of the game view; a framed picture can move the camera, then put it back, and end a running camera shot.',
};
/**
 * REVIEW-2 23 (a browser adaptation): what an Undo that undid nothing says while the Forge holds edits -- the run Undo's
 * own words (`../forge/page.ts` `undoAgentRunNow`), said under a row's Undo too.
 */
export const AGENT_EDITS_HELD_NOTE = 'Edits are held now: no agent changes undone';
export const AGENT_PERMISSIONS = Object.keys(PERMISSION_LABELS) as readonly AgentPermission[];
const LABELS = PERMISSION_LABELS;
const STATES: Record<AgentPanelState['status'], string> = {
  idle: '', creating: 'Preparing your link', waiting: 'Waiting for your agent',
  approval: 'Your approval is needed', connecting: 'Connecting to this page', connected: 'Agent connected',
  paused: 'Paused with this page', disconnected: 'Disconnected', error: 'Connection needs attention',
};
/** FP-14: a button's key in its tooltip, as the Forge's `key()` writes one (`../forge/page.ts`): a focused button takes Enter. */
const withKey = (b: HTMLButtonElement, label: string): void => { b.title = `${label} · Enter`; };
const clientLabel = (id: AgentClient): string => AGENT_CLIENTS.find((c) => c.id === id)!.label;
let pickers = 0;

/**
 * AX-U (AX.R2, AX.R3, AX.R7, C6; a browser adaptation, FG.R2 -- supersedes FP-14's four-step stepper, AX.R5): the
 * connection as one card with three moments, one shown at a time by the connection's state and each with one primary
 * action. **Connect**: pick your agent (a segmented control), its setup command the first time this browser pairs it,
 * then one "Copy connect link" -- one line, `./setup` `pairingText` -- with the invitation's countdown (the gateway's
 * `expiresAt`). **Allow**: "<client> wants to connect", every permission it asked for a switch, all on (AX.R2), the
 * comparison code as small print (AX.R3), Allow and Decline. **Connected**: its name and a live dot, the grants as chips,
 * the activity, the local files, Disconnect. An error names its stage and offers one retry.
 */
export function mountAgentPanel(host: HTMLElement, controller: AgentPanelController, options: AgentPanelOptions = {}): { dispose(): void } {
  const doc = host.ownerDocument;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const n = doc.createElement(tag); n.className = cls; n.textContent = text; return n;
  };
  const button = (cls: string, text: string): HTMLButtonElement => { const b = node('button', cls, text); b.type = 'button'; withKey(b, text); return b; };
  const label = (b: HTMLButtonElement, text: string): void => { b.textContent = text; withKey(b, text); };
  // FUI-22 (D2): in the Forge's dock, its one section style (`.fx-section`, forge.css); the test room's dock is unstyled
  // by it, so `.agent-panel` carries a base of its own (panel.css).
  const root = node('section', 'agent-panel fx-section'); root.setAttribute('aria-label', 'Connect your agent');
  const status = node('p', 'agent-panel__status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const statusDot = node('span', 'agent-panel__dot'); statusDot.setAttribute('aria-hidden', 'true');
  const statusText = node('span'); status.append(statusDot, statusText);
  const target = node('p', 'agent-panel__target');
  // An error: its stage named, one retry. AX-12: the doctor's class words, a failed route's details, and the class's
  // one action (Try again, Copy a fresh link, or Check the connection service address) on the same button.
  const error = node('div', 'agent-panel__error'); error.hidden = true; error.setAttribute('role', 'alert');
  const errorText = node('p', 'agent-panel__error-text');
  const diagnosisText = node('p', 'agent-panel__diagnosis'); diagnosisText.dataset.agentDiagnosis = ''; diagnosisText.hidden = true;
  const routeDetails = node('details', 'agent-panel__disclosure agent-panel__disclosure--quiet'); routeDetails.dataset.agentRouteDetails = '';
  const routeText = node('p', 'agent-panel__fine');
  routeDetails.append(node('summary', 'agent-panel__disclosure-summary', 'Details'), routeText); routeDetails.hidden = true;
  const retry = button('agent-panel__secondary agent-panel__retry', AGENT_DOCTOR_ACTIONS.retry); retry.dataset.agentRetry = '';
  retry.dataset.agentAction = 'retry';
  error.append(errorText, diagnosisText, routeDetails, retry);
  const moment = (id: AgentStage): HTMLElement => {
    const m = node('div', 'agent-panel__moment'); m.dataset.agentMoment = id; m.hidden = true; return m;
  };
  const moments = new Map<AgentStage, HTMLElement>(AGENT_STAGES.map(({ id }) => [id, moment(id)]));
  const connect = moments.get('connect')!, allow = moments.get('allow')!, connected = moments.get('connected')!;

  // --- Connect: the heading, the picker, the first-time disclosure, the one link.
  const connectHead = node('div', 'agent-panel__header');
  const mark = node('span', 'agent-panel__mark', '↔'); mark.setAttribute('aria-hidden', 'true');
  connectHead.append(mark, node('h3', 'agent-panel__title', 'Connect an agent'));
  const intro = node('p', 'agent-panel__intro', 'Let your AI agent build and test with you on this page. You approve what it can do.');
  const picker = node('div', 'agent-panel__segments'); picker.dataset.agentClientPicker = '';
  picker.setAttribute('role', 'radiogroup'); picker.setAttribute('aria-label', 'Your agent');
  const groupName = `agent-client-${++pickers}`;
  const radios = new Map<AgentClient, HTMLInputElement>();
  const startClient: AgentClient = lastPairedAgentClient() ?? 'claude';
  for (const c of AGENT_CLIENTS) {
    const seg = node('label', 'agent-panel__segment');
    const radio = node('input'); radio.type = 'radio'; radio.name = groupName; radio.value = c.id; radio.checked = c.id === startClient;
    seg.append(radio, node('span', '', c.label)); picker.append(seg); radios.set(c.id, radio);
  }
  const chosen = (): AgentClient => ([...radios].find(([, r]) => r.checked)?.[0]) ?? 'claude';
  const firstTime = node('details', 'agent-panel__disclosure'); firstTime.dataset.agentFirstTime = '';
  const firstSummary = node('summary', 'agent-panel__disclosure-summary');
  // FP-14 fold N1: a client listed but not yet measured says so.
  const clientNote = node('p', 'agent-panel__fine'); clientNote.dataset.agentClientNote = ''; clientNote.hidden = true;
  const rows = node('div', 'agent-panel__rows');
  const signIn = node('p', 'agent-panel__hint'); signIn.dataset.agentSignIn = '';
  firstTime.append(firstSummary, node('p', 'agent-panel__hint', 'Run this once where your agent runs.'), clientNote, rows, signIn);
  const copy = button('agent-panel__primary', AGENT_COPY_LINK_LABEL); copy.dataset.agentCopy = '';
  const linkHint = node('p', 'agent-panel__hint'); linkHint.dataset.agentLinkHint = ''; linkHint.hidden = true;
  const countdown = node('p', 'agent-panel__fine'); countdown.dataset.agentExpiry = '';
  countdown.setAttribute('role', 'timer'); countdown.setAttribute('aria-live', 'off'); countdown.hidden = true;
  // AX-12: the connection service's health as small print, from one GET /health on its first showing and on Retry.
  const healthLine = node('p', 'agent-panel__fine agent-panel__health'); healthLine.dataset.agentHealth = '';
  healthLine.hidden = !controller.health || options.healthOnShow === false;   // shown once a check runs
  const manual = node('textarea', 'agent-panel__manual'); manual.readOnly = true; manual.hidden = true; manual.rows = 3;
  manual.setAttribute('aria-label', 'Connect link'); manual.spellcheck = false;
  // LATER 423 (FP-14): the page's own address for the service, held to the connection's rule; it applies at the next load
  // (the connection is made with the page). The build's address, when it has one, wins and is shown only. Folded away.
  const address = options.gateway ?? doc.location.origin;
  const service = node('details', 'agent-panel__disclosure agent-panel__disclosure--quiet'); service.dataset.agentService = '';
  const endpointRow = node('p', 'agent-panel__readout');
  const endpointCode = node('code', 'agent-panel__code'); endpointCode.dataset.agentEndpoint = '';
  endpointRow.append(node('span', 'agent-panel__caption', 'MCP endpoint'), endpointCode);
  const gatewayLabel = node('label', 'agent-panel__label', 'Connection service');
  const gatewayField = node('input', 'agent-panel__field'); gatewayField.type = 'url'; gatewayField.dataset.agentGateway = '';
  gatewayField.value = address; gatewayField.spellcheck = false;
  const gatewaySave = button('agent-panel__secondary', 'Use this service'); gatewaySave.dataset.agentGatewaySave = '';
  const gatewayNote = node('p', 'agent-panel__fine'); gatewayNote.dataset.agentGatewayNote = '';
  const fromBuild = options.gatewaySource === 'build';
  gatewayField.disabled = fromBuild; gatewaySave.disabled = fromBuild;
  gatewayNote.textContent = fromBuild ? 'This address is set by this build.' : 'Leave empty for this page’s default service.';
  gatewayLabel.append(gatewayField);
  const gatewayRow = node('div', 'agent-panel__buttons'); gatewayRow.append(gatewaySave);
  service.append(node('summary', 'agent-panel__disclosure-summary', 'Connection service'), endpointRow, gatewayLabel, gatewayRow, gatewayNote);
  gatewaySave.addEventListener('click', () => {
    if (fromBuild) return;
    const value = gatewayField.value.trim();
    try {
      // PR #760 P2: a blocked or full storage returns { ok: false } rather than throwing; a reload would keep the old address.
      const origin = value ? safeGateway(value).origin : '';
      const written = origin ? pageSettings.set(AGENT_GATEWAY_KEY, origin) : pageSettings.remove(AGENT_GATEWAY_KEY);
      if (!written.ok) {
        gatewayNote.textContent = agentStageError('connect', `This browser did not ${origin ? 'save' : 'clear'} the address (its storage is blocked or full).`);
        return;
      }
      if (origin) gatewayField.value = origin;
      gatewayNote.textContent = 'Saved. Reload this page to connect through it.';
    } catch (e) { gatewayNote.textContent = agentStageError('connect', e instanceof Error ? e.message : 'The address is not usable.'); }
  });
  // AX-9: after a reload with a resume ticket, the one-click way back comes first; the player's consent stays explicit.
  const resumeCard = node('div', 'agent-panel__resume'); resumeCard.dataset.agentResume = ''; resumeCard.hidden = true;
  const resumeNote = node('p', 'agent-panel__hint', 'This page reloaded. Pick up where you left off. It will be able to:');
  // REVIEW-1 finding 7 (AX.R2): the grants Reconnect gives back, each named before the click -- read-only chips.
  const resumeList = node('ul', 'agent-panel__chips'); resumeList.dataset.agentResumePermissions = '';
  resumeList.setAttribute('aria-label', 'What it will be able to do');
  const reconnect = button('agent-panel__primary', 'Reconnect'); reconnect.dataset.agentReconnect = '';
  const resumeOther = button('agent-panel__secondary', 'Connect afresh'); resumeOther.dataset.agentResumeDismiss = '';
  const resumeButtons = node('div', 'agent-panel__buttons'); resumeButtons.append(reconnect, resumeOther);
  resumeCard.append(resumeNote, resumeList, resumeButtons);
  // AX-10: the Connect moment's footer -- the agents this browser remembers, each with Forget (Disconnect keeps them).
  const rememberedBox = node('div', 'agent-panel__remembered'); rememberedBox.dataset.agentRememberedList = ''; rememberedBox.hidden = true;
  const rememberedList = node('ul', 'agent-panel__remembered-list');
  rememberedBox.append(node('h4', 'agent-panel__caption', 'Remembered agents'), rememberedList);
  let rememberedShown = '';
  const paintRemembered = (): void => {
    const list = rememberedAgents(), key = JSON.stringify(list);
    if (key === rememberedShown) return;
    rememberedShown = key; rememberedBox.hidden = list.length === 0;
    rememberedList.replaceChildren(...list.map((entry: RememberedAgent) => {
      const li = node('li', 'agent-panel__remembered-entry');
      const forget = button('agent-panel__secondary agent-panel__forget', 'Forget'); forget.dataset.agentForget = '';
      forget.setAttribute('aria-label', `Forget ${entry.clientName}`);
      forget.addEventListener('click', () => { forgetRememberedAgent(entry); paintRemembered(); });
      li.append(node('span', 'agent-panel__remembered-name', entry.clientName), forget);
      return li;
    }));
  };
  connect.append(resumeCard, connectHead, intro, picker, firstTime, copy, linkHint, countdown, manual, healthLine, service, rememberedBox);

  // --- Allow: who asks, every permission a switch (all requested on), Allow / Decline, the code as small print.
  const allowTitle = node('h3', 'agent-panel__title'); allowTitle.dataset.agentClientName = '';
  const allowNote = node('p', 'agent-panel__fine', 'The name is reported by the agent itself.');
  const permissions = node('fieldset', 'agent-panel__permissions');
  const legendText = 'What it can do';
  const rowViews: { permission: AgentPermission; row: HTMLElement; check: HTMLInputElement; requested: boolean }[] = [];
  const approve = button('agent-panel__primary', AGENT_ALLOW_LABEL); approve.dataset.agentApprove = '';
  const deny = button('agent-panel__secondary', 'Decline'); deny.dataset.agentDeny = '';
  const consentButtons = node('div', 'agent-panel__buttons'); consentButtons.append(approve, deny);
  const comparison = node('p', 'agent-panel__comparison agent-panel__fine');
  const comparisonCode = node('strong', 'agent-panel__code-inline'); comparisonCode.dataset.agentComparisonCode = '';
  // AX-10 (AX.R2): "Remember <client> on this browser", off by default; a remembered agent's card is compact.
  const rememberRow = node('label', 'agent-panel__remember');
  const rememberBox = node('input', 'agent-panel__remember-box'); rememberBox.type = 'checkbox'; rememberBox.dataset.agentRemember = '';
  const rememberLabel = node('span'); rememberLabel.dataset.agentRememberLabel = '';
  rememberRow.append(rememberBox, rememberLabel);
  let pendingWho: AgentIdentity | undefined, rememberedNow: RememberedAgent | undefined;
  allow.append(allowTitle, allowNote, permissions, rememberRow, consentButtons, comparison);
  const paintRows = (): void => {
    for (const v of rowViews) v.row.dataset.state = !v.requested ? 'not-requested' : v.check.checked ? 'on' : 'off';
    approve.disabled = !rowViews.some((v) => v.requested && v.check.checked);
  };

  // --- Connected: the name and live dot, the grants as chips, the activity, the files, Disconnect.
  const connectedHead = node('div', 'agent-panel__header');
  const live = node('span', 'agent-panel__live'); live.setAttribute('aria-hidden', 'true');
  const connectedName = node('h3', 'agent-panel__title'); connectedName.dataset.agentConnectedName = '';
  connectedHead.append(live, connectedName);
  const granted = node('div', 'agent-panel__granted'); granted.hidden = true;
  const grantedList = node('ul', 'agent-panel__chips'); grantedList.setAttribute('aria-label', 'What it can do');
  granted.append(grantedList);
  const files = node('div', 'agent-panel__files');
  const folder = button('agent-panel__secondary', 'Choose a local folder');
  const stage = node('label', 'agent-panel__file-button', 'Add local files');
  const input = node('input'); input.type = 'file'; input.multiple = true; input.setAttribute('aria-label', 'Add local files');
  input.accept = '.json,.zip,.glb,.png'; stage.append(input);
  const openStaging = button('agent-panel__secondary', 'Add local files in Content');
  openStaging.dataset.agentOpenStaging = '';
  const fileStatus = node('p', 'agent-panel__fine', 'Your files stay on this device. Only a folder or files you choose can be read.');
  if (options.chooseDirectory) files.append(folder);
  if (options.openStaging) files.append(openStaging);
  else if (options.stageFiles) files.append(stage);
  if (options.chooseDirectory || options.stageFiles || options.openStaging) files.append(fileStatus);
  const recent = node('div', 'agent-panel__recent'); recent.append(node('h4', 'agent-panel__caption', 'Recent activity'));
  const activity = node('ol', 'agent-panel__activity'); activity.dataset.agentActivity = ''; recent.append(activity); recent.hidden = true;
  // AX-15: the one button that undoes the agent's run, and what it did.
  const undoRun = button('agent-panel__secondary', 'Undo the agent’s changes'); undoRun.dataset.agentUndoRun = '';
  const undoRunNote = node('p', 'agent-panel__hint'); undoRunNote.setAttribute('role', 'status'); undoRunNote.hidden = true;
  const paintUndoRun = (): void => { undoRun.disabled = !(options.agentChanges?.().undoable ?? false); };
  // REVIEW-2 23: a row's Undo that undoes nothing (the Forge holds edits: Play, busy, a lobby) says so, as the run's does.
  const undoRowNote = node('p', 'agent-panel__hint', AGENT_EDITS_HELD_NOTE); undoRowNote.dataset.agentUndoRowNote = '';
  undoRowNote.setAttribute('role', 'status'); undoRowNote.hidden = true;
  /** REVIEW-3-SHADOW 2: the row read again now -- is its step still the top of the history (the store's `undoable`)? */
  const stillUndoable = (id: number | undefined): boolean =>
    id !== undefined && !!options.activity?.entries().some((entry) => entry.id === id && entry.undoable);
  // AX-13: what the agent can see of the player's pointing, the point rounded to whole game units.
  const focusLine = node('p', 'agent-panel__fine'); focusLine.dataset.agentFocus = ''; focusLine.hidden = true;
  let focusShown = false;
  const paintFocus = (): void => {
    if (!options.lastPoint) return;
    focusLine.hidden = !focusShown;
    const at = focusShown ? options.lastPoint.read() : null;
    focusLine.textContent = at ? `${AGENT_FOCUS_LINE}: ${at.map((v) => Math.round(v) || 0).join(', ')}.` : `${AGENT_FOCUS_LINE}.`;
  };
  // AX-14: the note box -- the player's words to the agent, sent over the pairing; each sent note listed, marked when read.
  // Notes are plain text: set as textContent, never parsed as markup.
  const notes = node('form', 'agent-panel__notes'); notes.dataset.agentNotes = '';
  notes.setAttribute('aria-label', 'Notes to your agent');
  const noteField = node('textarea', 'agent-panel__field agent-panel__note-field'); noteField.dataset.agentNoteText = '';
  noteField.placeholder = AGENT_NOTE_PROMPT; noteField.maxLength = LIMITS.noteChars; noteField.rows = 2;
  noteField.setAttribute('aria-label', 'Tell your agent');
  const noteSend = node('button', 'agent-panel__secondary agent-panel__note-send', 'Send'); noteSend.type = 'submit';
  noteSend.dataset.agentNoteSend = ''; withKey(noteSend, 'Send');
  const noteRow = node('div', 'agent-panel__note-row'); noteRow.append(noteField, noteSend);
  const noteStatus = node('p', 'agent-panel__fine'); noteStatus.dataset.agentNoteStatus = ''; noteStatus.setAttribute('role', 'status'); noteStatus.hidden = true;
  const noteList = node('ol', 'agent-panel__note-list'); noteList.dataset.agentNoteList = ''; noteList.hidden = true;
  notes.append(noteRow, noteStatus, noteList);
  const disconnect = button('agent-panel__disconnect', 'Disconnect');
  disconnect.dataset.agentDisconnect = ''; disconnect.hidden = true;
  const privacy = node('p', 'agent-panel__fine', 'Actions and requested canvas images pass through the connection service. Pack contents stay local.');
  connected.append(connectedHead, granted, ...(options.lastPoint ? [focusLine] : []), ...(controller.sendNote ? [notes] : []), recent, undoRowNote, ...(options.undoAgentRun ? [undoRun, undoRunNote] : []), files, disconnect, privacy);

  // The pad's prompts, once, at the card's foot (MCW.R10).
  const legend = node('ul');
  drawLegend(doc, legend, AGENT_STAGE_LEGEND.connect, { pad: false, placement: 'inline' });
  root.append(status, target, error, connect, allow, connected, legend);
  host.append(root);

  let disposed = false, pendingCode: string | undefined, busy = false, copyGeneration = 0, agentName = '';
  let shownStage: AgentStage | null = null, from: AgentPanelState['status'] = 'idle', last: AgentPanelState['status'] = 'idle';
  const writeClipboard = (text: string): Promise<void> => (options.copy ?? (value => navigator.clipboard.writeText(value)))(text);
  const copyRow = async (b: HTMLButtonElement, text: string): Promise<void> => {
    try { await writeClipboard(text); if (!disposed) b.textContent = 'Copied'; }
    catch { if (!disposed) b.textContent = 'Select it to copy'; }
  };
  // The disclosure, the hint and the rows follow the client; the address is held to the connection's own rule (`./setup`).
  const paintClient = (): void => {
    const which = chosen(), name = clientLabel(which);
    firstSummary.textContent = `First time with ${name}?`;
    firstTime.open = !agentClientPaired(which);
    signIn.textContent = AGENT_AUTHORIZE_WORDS[which];
    clientNote.textContent = AGENT_CLIENT_NOTES[which] ?? ''; clientNote.hidden = !AGENT_CLIENT_NOTES[which];
    linkHint.textContent = `Paste it into ${name}. You’ll approve here.`;
    let list: ReturnType<typeof agentSetupRows> = [];
    try { endpointCode.textContent = agentEndpoint(address); list = agentSetupRows(which, address); }
    catch (e) { endpointCode.textContent = agentStageError('connect', e instanceof Error ? e.message : 'The connection service address is not usable.'); }
    rows.replaceChildren(...list.map((row, i) => {
      const line = node('div', 'fx-field-row agent-panel__row');
      const code = node('code', 'agent-panel__code', row.text);
      const b = button('agent-panel__secondary agent-panel__copy', 'Copy');
      if (i === 0) b.dataset.agentCopyCommands = '';
      b.setAttribute('aria-label', `Copy: ${row.caption}`);
      b.addEventListener('click', () => { void copyRow(b, row.text); });
      line.append(node('span', 'agent-panel__caption', row.caption), code, b);
      return line;
    }));
  };
  paintClient();
  let deadline: number | undefined, countdownTimer: ReturnType<typeof setTimeout> | undefined;
  const clearManual = (): void => { manual.value = ''; manual.hidden = true; };
  const expired = (at = deadline): boolean => at !== undefined && at <= Date.now();
  const cancelCopy = (): void => { copyGeneration++; busy = false; clearManual(); linkHint.hidden = true; label(copy, AGENT_COPY_LINK_LABEL); };
  function tick(): void {
    clearTimeout(countdownTimer); countdownTimer = undefined;
    if (disposed || deadline === undefined) { countdown.hidden = true; return; }
    countdown.hidden = false;
    // LATER 483 (FP-14): the countdown is the gateway's `expiresAt` (the registration's), never a page clock of its own.
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    countdown.textContent = seconds ? `Link expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
      : 'The link expired. Copy a fresh one.';
    if (!seconds) {
      // A native clipboard prompt can remain pending indefinitely. Expiry must release the retry button,
      // and a late result must not revive the expired link or replace a newer attempt.
      cancelCopy(); label(copy, 'Copy a fresh link');
      copy.disabled = controller.state().status === 'creating' || controller.state().status === 'connecting';
    }
    else countdownTimer = setTimeout(tick, Math.min(1000, deadline - Date.now()));
  }
  const showError = (text: string): void => { errorText.textContent = text; errorText.hidden = false; error.hidden = false; };
  // AX-12: the class's words, its action on the one button, the route's details when the route failed.
  const paintDiagnosis = (d: Diagnosis | undefined): void => {
    const doctor = d ? AGENT_DIAGNOSIS[d.class] : undefined;
    if (d) root.dataset.diagnosis = d.class; else delete root.dataset.diagnosis;
    diagnosisText.hidden = !doctor; diagnosisText.textContent = doctor?.words ?? '';
    const action = doctor?.action ?? 'retry';
    retry.dataset.agentAction = action; label(retry, AGENT_DOCTOR_ACTIONS[action]);
    routeDetails.hidden = d?.class !== 'route-failed';
    routeText.textContent = d?.class === 'route-failed' ? agentRouteDetails(d) : '';
  };
  let healthGeneration = 0;
  let unfold = (): void => undefined;
  const checkHealth = (): void => {
    if (!controller.health || disposed) return;
    const mine = ++healthGeneration;
    healthLine.hidden = false;
    healthLine.textContent = AGENT_HEALTH_WORDS.checking;
    void controller.health().catch(() => 'unreachable' as const).then((h) => {
      if (!disposed && mine === healthGeneration) healthLine.textContent = AGENT_HEALTH_WORDS[h === 'ready' ? 'ready' : 'unreachable'];
    });
  };
  function render(state: AgentPanelState): void {
    if (disposed) return;
    root.dataset.state = state.status;
    const stageNow = agentStageFor(state.status, from);
    if (state.status !== 'error') from = state.status;
    if (stageNow !== shownStage) {
      shownStage = stageNow; root.dataset.moment = stageNow;
      for (const [id, m] of moments) m.hidden = id !== stageNow;
      options.onStage?.(stageNow);
    }
    // AX-U: the client a live pairing came from is remembered, so its first-time disclosure starts folded next time.
    if (state.status === 'connected' && last !== 'connected') rememberAgentClientPaired(chosen());
    last = state.status;
    // AX-8 (AX.R4): a connected pairing in a hidden tab says it is paused (tests wait for the tab).
    statusText.textContent = state.hidden && state.status === 'connected' ? AGENT_HIDDEN_NOTE : STATES[state.status]; status.hidden = !STATES[state.status];
    target.textContent = state.target;
    // AX-9: the Reconnect card, while the reload's ticket is held and nothing else is under way.
    resumeCard.hidden = !state.resume || stageNow !== 'connect';
    // One primary action a moment (AX-U): while the card shows, Reconnect is it and Copy steps back.
    reconnect.classList.toggle('agent-panel__primary', !resumeCard.hidden); reconnect.classList.toggle('agent-panel__secondary', resumeCard.hidden);
    copy.classList.toggle('agent-panel__primary', resumeCard.hidden); copy.classList.toggle('agent-panel__secondary', !resumeCard.hidden);
    if (state.resume) label(reconnect, `Reconnect ${state.resume.clientName || 'your agent'}`);
    const held = state.resume?.permissions ?? [];
    resumeList.replaceChildren(...(state.resume ? AGENT_PERMISSIONS.map((permission) => {
      const yes = held.includes(permission);
      const li = node('li', `agent-panel__chip ${yes ? 'agent-panel__chip--on' : 'agent-panel__chip--off'}`, LABELS[permission]);
      li.dataset.permission = permission; li.dataset.granted = String(yes);
      li.setAttribute('aria-label', `${LABELS[permission]}: ${yes ? 'will be granted' : 'not granted'}`);
      return li;
    }) : []));
    disconnect.hidden = state.status === 'idle' || state.status === 'disconnected';
    if (Number.isFinite(state.expiresAt)) deadline = state.expiresAt;
    else if (!expired() || state.status !== 'disconnected') deadline = undefined;
    if (['paused', 'disconnected', 'connected', 'error'].includes(state.status)) {
      clearManual();
      if (!expired()) cancelCopy();
    }
    tick();
    copy.disabled = busy || state.status === 'creating' || state.status === 'connecting';
    paintDiagnosis(state.diagnosis);
    if (state.error) showError(agentStageError(stageNow, state.error));
    else if (state.diagnosis) { errorText.hidden = true; error.hidden = false; }
    else error.hidden = true;
    if (state.pending) {
      agentName = state.pending.clientName;
      comparisonCode.textContent = state.pending.comparisonCode;
      comparison.replaceChildren('Check: the code ', comparisonCode, ' matches your agent\'s');
      if (pendingCode !== state.pending.comparisonCode) {
        pendingCode = state.pending.comparisonCode; rowViews.length = 0;
        // AX-10: a remembered agent (by the gateway's client id, else its name) gets the compact card, its switches set to
        // its last grants; it is still one explicit Allow. A storage failure finds nothing: the full card.
        pendingWho = { clientName: state.pending.clientName, ...(state.pending.gatewayClientId ? { gatewayClientId: state.pending.gatewayClientId } : {}) };
        rememberedNow = findRememberedAgent(pendingWho);
        allow.toggleAttribute('data-agent-remembered', !!rememberedNow);
        allow.classList.toggle('agent-panel__moment--remembered', !!rememberedNow);
        // REVIEW-1 finding 8: a match by the reported name alone keeps the self-report note in view.
        allowNote.hidden = !!rememberedNow && matchedById(rememberedNow, pendingWho);
        rememberBox.checked = false; rememberRow.hidden = !!rememberedNow;
        rememberLabel.textContent = `Remember ${state.pending.clientName} on this browser`;
        permissions.replaceChildren(node('legend', 'agent-panel__caption', legendText));
        // AX.R2: every permission is listed, in the labels' order; every one the agent asked for is a switch, on. The
        // connection grants only what the agent asked for (connection.ts `approve` drops the rest), so an unrequested one
        // is shown disabled, never offered.
        for (const permission of AGENT_PERMISSIONS) {
          const requested = state.pending.permissions.includes(permission);
          const row = node('label', 'agent-panel__permission'); row.dataset.permission = permission;
          const check = node('input', 'agent-panel__switch'); check.type = 'checkbox'; check.setAttribute('role', 'switch');
          check.value = permission; check.checked = requested && (!rememberedNow || rememberedNow.grants.includes(permission));
          check.disabled = !requested;
          const words = node('span', 'agent-panel__permission-words');
          words.append(node('span', 'agent-panel__permission-label', LABELS[permission]),
            node('span', 'agent-panel__permission-detail', requested ? PERMISSION_DETAILS[permission] : `Not requested · ${PERMISSION_DETAILS[permission]}`));
          rowViews.push({ permission, row, check, requested });
          check.addEventListener('change', paintRows);
          row.append(words, check); permissions.append(row);
        }
        paintRows();
      }
      allowTitle.textContent = rememberedNow ? `${state.pending.clientName} (remembered) wants to connect` : `${state.pending.clientName} wants to connect`;
    } else { pendingCode = undefined; pendingWho = undefined; rememberedNow = undefined; }
    paintRemembered();
    connectedName.textContent = agentName || 'Your agent';
    // FUI-25: the connected state names every permission, granted or not, as chips.
    const showGrants = ['connected', 'connecting', 'paused'].includes(state.status) && state.permissions.length > 0;
    granted.hidden = !showGrants;
    grantedList.replaceChildren(...(showGrants ? AGENT_PERMISSIONS.map(permission => {
      const yes = state.permissions.includes(permission);
      const li = node('li', `agent-panel__chip ${yes ? 'agent-panel__chip--on' : 'agent-panel__chip--off'}`, LABELS[permission]);
      li.dataset.permission = permission; li.dataset.granted = String(yes);
      li.setAttribute('aria-label', `${LABELS[permission]}: ${yes ? 'granted' : 'not granted'}`);
      return li;
    }) : []));
    const feed: readonly { id?: number; text: string; kind: 'success' | 'error' | 'info'; code?: string; undoable?: boolean; undo?: () => number }[] =
      options.activity ? options.activity.entries() : state.activity;
    recent.hidden = feed.length === 0;
    activity.replaceChildren(...feed.slice(-8).reverse().map(item => {
      const li = node('li', `agent-panel__activity-${item.kind}`, item.text);
      if (item.code) li.dataset.agentCode = item.code;
      // AX-15 (REVIEW-1 finding 12): a row whose step is on top of the history now takes back exactly it, the page's own
      // undo (`./activity` `undo()`); the store hears the history change and the feed redraws.
      if (item.undoable && item.undo) {
        const undoRow = button('agent-panel__secondary agent-panel__undo-row', 'Undo'); undoRow.dataset.agentUndoRow = '';
        undoRow.setAttribute('aria-label', `Undo: ${item.text}`);
        const undo = item.undo;
        // REVIEW-3-SHADOW 2: the note only when the page held the undo back -- the row's step still on top, nothing undone
        // (`undo()` answers 0 as well when a later edit covered the step before this redraw: no note then).
        undoRow.addEventListener('click', () => {
          if (disposed) return;
          undoRowNote.hidden = undo() > 0 || !stillUndoable(item.id);
          paintUndoRun();
        });
        li.append(' ', undoRow);
      }
      return li;
    }));
    // REVIEW-3-SHADOW 2: with no row left to undo, nothing is held back: the held note goes on this redraw.
    if (!feed.some((item) => item.undoable && item.undo)) undoRowNote.hidden = true;
    paintUndoRun();
    // AX-14: the sent notes, newest first, each marked delivered once the agent has read it.
    const sentNotes = state.notes ?? [];
    noteList.hidden = sentNotes.length === 0;
    noteList.replaceChildren(...sentNotes.slice().reverse().map((n) => {
      const li = node('li', `agent-panel__note agent-panel__note--${n.state}`);
      li.dataset.noteState = n.state;
      const mark = n.state === 'delivered' ? AGENT_NOTE_DELIVERED : n.state === 'refused' ? agentCodeWords(n.code) : 'sent';
      li.append(node('span', 'agent-panel__note-text', n.text), node('span', 'agent-panel__note-mark', mark));
      return li;
    }));
    noteSend.disabled = state.status !== 'connected';
    focusShown = state.status === 'connected' && state.permissions.includes('inspect');
    paintFocus();
  }
  notes.addEventListener('submit', (e) => {
    e.preventDefault();
    if (disposed || !controller.sendNote) return;
    const code = controller.sendNote(noteField.value);
    noteStatus.hidden = !code;
    noteStatus.textContent = code ? agentCodeWords(code) : '';
    if (!code) noteField.value = '';
  });
  // Enter sends; Shift+Enter is a new line.
  noteField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); notes.requestSubmit(); }
  });
  undoRun.addEventListener('click', () => {
    if (disposed) return;
    const out = options.undoAgentRun?.();
    if (out) { undoRunNote.textContent = out.message; undoRunNote.hidden = false; undoRowNote.hidden = true; }
    paintUndoRun();
  });
  const unsubscribe = controller.subscribe(render); render(controller.state());
  const unsubscribeActivity = options.activity?.subscribe(() => render(controller.state())) ?? (() => undefined);
  const unsubscribeFocus = options.lastPoint?.subscribe?.(() => { if (!disposed) paintFocus(); }) ?? (() => undefined);   // AX-13
  const copyLink = (): void => { void (async () => {
    if (busy || disposed) return;
    const mine = ++copyGeneration, client = chosen();
    const current = (): boolean => !disposed && mine === copyGeneration && chosen() === client;
    busy = true; clearManual(); linkHint.hidden = true; error.hidden = true;
    copy.disabled = true; label(copy, 'Preparing…');
    try {
      const text = await controller.prepare(client);
      if (!current()) return;
      const preparedDeadline = controller.state().expiresAt;
      try {
        if (expired(preparedDeadline)) { tick(); return; }
        // The clipboard may wait for browser focus or permission without resolving or rejecting.
        // Make the current link usable immediately; never imply an old clipboard value is ready.
        manual.value = text; manual.hidden = false;
        label(copy, 'Copying… You can copy the link below');
        await writeClipboard(text);
        if (!current()) return;
        if (expired(preparedDeadline)) { tick(); return; }
        manual.value = ''; manual.hidden = true; label(copy, 'Copied'); linkHint.hidden = false;
      } catch {
        if (!current()) return;
        if (expired(preparedDeadline)) { tick(); return; }
        manual.value = text; manual.hidden = false; manual.focus(); manual.select();
        label(copy, 'Copy failed · Select and copy the link below'); linkHint.hidden = false;
      }
    } catch (e) {
      if (current()) {
        clearManual();
        // The connection's own failure is already said, its stage named, by `render`; anything else is Connect's.
        if (controller.state().status !== 'error') showError(agentStageError('connect', e instanceof Error ? e.message : 'Could not prepare the link.'));
        label(copy, AGENT_COPY_LINK_LABEL);
      }
    } finally { if (current()) { busy = false; copy.disabled = controller.state().status === 'connecting'; } }
  })(); };
  copy.addEventListener('click', copyLink);
  retry.addEventListener('click', () => {
    // AX-12: Check the address opens the Connection service disclosure at its field; the others copy again.
    if (retry.dataset.agentAction === 'check-service') {
      service.open = true;
      if (!gatewayField.disabled) gatewayField.focus(); else service.querySelector('summary')?.focus();
      return;
    }
    error.hidden = true; cancelCopy(); checkHealth(); copyLink();
  });
  // AX-12's mount check, on the panel's first showing: the test room's dock and the Forge's Agent panel are folded
  // `details`, and a page that never opens one asks the connection service nothing -- a refused GET is a console error
  // on every load where no service runs (the development default's loopback; the e2e view at 394ac3273). A browser adaptation.
  // Not at all where `healthOnShow` is false (the development default loopback: `./setup` `agentHealthOnShow`); a Retry checks.
  const fold = host.closest('details');
  if (options.healthOnShow === false) { /* no check on showing */ } else if (!fold || fold.open) checkHealth();
  else {
    const onToggle = (e: Event): void => {
      if (e.target !== fold || !fold.open) return;
      fold.removeEventListener('toggle', onToggle); checkHealth();
    };
    fold.addEventListener('toggle', onToggle);
    unfold = () => fold.removeEventListener('toggle', onToggle);
  }
  for (const radio of radios.values()) radio.addEventListener('change', () => { cancelCopy(); copy.disabled = false; paintClient(); });
  approve.addEventListener('click', () => {
    const grants = rowViews.filter(v => v.requested && v.check.checked).map(v => v.permission);
    // AX-10: remembered on the person's own tick (or refreshed for a remembered agent); a refused write changes nothing else.
    if (pendingWho && (rememberBox.checked || rememberedNow)) { rememberAgent(pendingWho, grants); paintRemembered(); }
    controller.approve(grants);
  });
  deny.addEventListener('click', () => controller.deny());
  reconnect.addEventListener('click', () => {
    const held = controller.state().resume;
    if (disposed || !held) return;
    agentName = held.clientName; error.hidden = true; cancelCopy();
    void controller.reconnect?.().catch(e => { if (!disposed) showError(agentStageError('connect', e instanceof Error ? e.message : 'Could not reconnect.')); });
  });
  resumeOther.addEventListener('click', () => { if (!disposed) controller.forgetResume?.(); });
  disconnect.addEventListener('click', () => { cancelCopy(); controller.disconnect(); });
  openStaging.addEventListener('click', () => { if (!disposed) options.openStaging?.(); });
  folder.addEventListener('click', () => { void options.chooseDirectory?.().then(name => {
    if (!disposed && name) fileStatus.textContent = `Local folder ready: ${name}`;
  }).catch(e => { if (!disposed) { fileStatus.textContent = e instanceof Error ? e.message : 'Folder access was not granted.'; } }); });
  input.addEventListener('change', () => { const picked = Array.from(input.files ?? []); if (!picked.length) return;
    fileStatus.textContent = `Reading ${picked.length} local file${picked.length === 1 ? '' : 's'}…`;
    void options.stageFiles?.(picked).then(() => { if (!disposed) fileStatus.textContent = `${picked.length} file${picked.length === 1 ? '' : 's'} ready for your agent.`; })
      .catch(e => { if (!disposed) fileStatus.textContent = e instanceof Error ? e.message : 'Could not read these files.'; }); input.value = '';
  });
  return { dispose() { if (disposed) return; disposed = true; unfold(); cancelCopy(); clearTimeout(countdownTimer); unsubscribe(); unsubscribeActivity(); unsubscribeFocus(); root.remove(); } };
}
