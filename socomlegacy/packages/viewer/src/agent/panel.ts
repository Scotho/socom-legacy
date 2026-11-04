import './panel.css';
import { pageSettings } from '../pageStore';
import type { AgentActivityStore } from './activity';

/** Browser adaptation: explicit page consent and a visible, revocable agent connection. */
export type AgentClient = 'claude' | 'codex' | 'other';
export type AgentPermission = 'inspect' | 'edit' | 'import' | 'test' | 'diagnose' | 'capture';
export interface AgentPanelState {
  status: 'idle' | 'creating' | 'waiting' | 'approval' | 'connecting' | 'connected' | 'paused' | 'disconnected' | 'error';
  target: string;
  /** Browser adaptation: public invitation deadline only, never a token or session lifetime. */
  expiresAt?: number;
  permissions: readonly AgentPermission[];
  pending?: { clientName: string; comparisonCode: string; permissions: readonly AgentPermission[] };
  error?: string;
  activity: readonly { text: string; kind: 'success' | 'error' | 'info' }[];
}
export interface AgentPanelController {
  state(): AgentPanelState;
  subscribe(listener: (state: AgentPanelState) => void): () => void;
  prepare(client: AgentClient): Promise<string>;
  approve(permissions: AgentPermission[]): void;
  deny(): void;
  disconnect(): void;
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
}
/** FUI-25 (FUI.R25; a browser adaptation): the labels, whose key order is the order every grant list shows. */
export const PERMISSION_LABELS: Record<AgentPermission, string> = {
  inspect: 'Read this session', edit: 'Edit the map', import: 'Import local packs', test: 'Run tests',
  diagnose: 'Read diagnostics', capture: 'See the game canvas',
};
export const AGENT_PERMISSIONS = Object.keys(PERMISSION_LABELS) as readonly AgentPermission[];
const LABELS = PERMISSION_LABELS;
/** FUI-25: the per-viewer convenience of the short form (only what the agent asked for); a page right without it. */
const SHORT_FORM_KEY = 'forge.agent.permissions.shortForm';
const STATES: Record<AgentPanelState['status'], string> = {
  idle: 'Ready when you are', creating: 'Preparing your connection', waiting: 'Waiting for your agent',
  approval: 'Your approval is needed', connecting: 'Connecting to this page', connected: 'Agent connected',
  paused: 'Paused with this page', disconnected: 'Disconnected', error: 'Connection needs attention',
};

export function mountAgentPanel(host: HTMLElement, controller: AgentPanelController, options: AgentPanelOptions = {}): { dispose(): void } {
  const doc = host.ownerDocument;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const n = doc.createElement(tag); n.className = cls; n.textContent = text; return n;
  };
  // FUI-22 (D2): in the Forge's dock, its one section style (`.fx-section`, forge.css); the test room's dock is unstyled by it.
  const root = node('section', 'agent-panel fx-section'); root.setAttribute('aria-label', 'Connect your agent');
  const header = node('div', 'agent-panel__header');
  const mark = node('span', 'agent-panel__mark', '↔'); mark.setAttribute('aria-hidden', 'true');
  const heading = node('h2', '', 'Build together');
  header.append(mark, heading);
  const intro = node('p', 'agent-panel__intro', 'Give your agent a view into this page. Watch each change as it happens.');
  const status = node('p', 'agent-panel__status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const statusDot = node('span', 'agent-panel__dot'); statusDot.setAttribute('aria-hidden', 'true');
  const statusText = node('span'); status.append(statusDot, statusText);
  const target = node('p', 'agent-panel__target');
  const countdown = node('p', 'agent-panel__hint'); countdown.dataset.agentExpiry = '';
  countdown.setAttribute('role', 'timer'); countdown.setAttribute('aria-live', 'off'); countdown.hidden = true;
  const label = node('label', 'agent-panel__label', 'Your agent');
  const select = node('select', 'agent-panel__select'); select.setAttribute('aria-label', 'Your agent');
  for (const [value, text] of [['claude', 'Claude Code'], ['codex', 'Codex'], ['other', 'Another MCP client']]) {
    const option = node('option', '', text!); option.value = value!; select.append(option);
  }
  label.append(select);
  const copy = node('button', 'agent-panel__primary', 'Copy connection instructions'); copy.type = 'button'; copy.dataset.agentCopy = '';
  const hint = node('p', 'agent-panel__hint', 'Paste into your agent. Guests are welcome. You approve access here.');
  const manual = node('textarea', 'agent-panel__manual'); manual.readOnly = true; manual.hidden = true;
  manual.setAttribute('aria-label', 'Connection instructions'); manual.spellcheck = false;
  const consent = node('div', 'agent-panel__consent'); consent.hidden = true;
  const consentTitle = node('h3', '', 'Allow this connection?');
  const client = node('p', 'agent-panel__client');
  const comparison = node('p', 'agent-panel__comparison');
  const comparisonHint = node('p', 'agent-panel__hint', 'Match this code to your agent’s request. The client name is self-reported.');
  const permissions = node('fieldset', 'agent-panel__permissions'); permissions.append(node('legend', '', 'Choose what it can do'));
  const checks = new Map<AgentPermission, HTMLInputElement>();
  // FUI-25 (FUI.R25): every permission is listed; "Show only what the agent asked for" is off unless the person turns it on.
  // The page's keys go through `../pageStore` (its inventory test): a failed read or write is the store's to report.
  let shortForm = false;
  try { shortForm = pageSettings.get(SHORT_FORM_KEY) === '1'; } catch { /* the page is right without storage */ }
  const shortLabel = node('label', 'agent-panel__short');
  const shortToggle = node('input'); shortToggle.type = 'checkbox'; shortToggle.checked = shortForm; shortToggle.dataset.agentShortForm = '';
  shortLabel.append(shortToggle, node('span', '', 'Show only what the agent asked for'));
  const rowViews: { permission: AgentPermission; row: HTMLElement; check: HTMLInputElement; requested: boolean; stateText: HTMLElement }[] = [];
  const rowState = (v: { check: HTMLInputElement; requested: boolean }): string =>
    !v.requested ? 'Not requested by the agent' : v.check.checked ? 'Requested · will be allowed' : 'Requested · not allowed';
  const paintRows = (): void => { for (const v of rowViews) {
    v.row.hidden = shortForm && !v.requested; v.stateText.textContent = rowState(v);
    v.row.dataset.state = !v.requested ? 'not-requested' : v.check.checked ? 'allowed' : 'requested';
  } };
  const granted = node('div', 'agent-panel__granted'); granted.hidden = true;
  const grantedList = node('ul', 'agent-panel__granted-list');
  granted.append(node('h3', '', 'What it can do'), grantedList);
  const approve = node('button', 'agent-panel__primary', 'Allow selected access'); approve.type = 'button'; approve.dataset.agentApprove = '';
  const deny = node('button', 'agent-panel__secondary', 'Decline'); deny.type = 'button';
  const consentButtons = node('div', 'agent-panel__buttons'); consentButtons.append(approve, deny);
  consent.append(consentTitle, client, comparison, comparisonHint, shortLabel, permissions, consentButtons);
  const files = node('div', 'agent-panel__files');
  const folder = node('button', 'agent-panel__secondary', 'Choose a local folder'); folder.type = 'button';
  const stage = node('label', 'agent-panel__file-button', 'Add local files');
  const input = node('input'); input.type = 'file'; input.multiple = true; input.setAttribute('aria-label', 'Add local files');
  input.accept = '.json,.zip,.glb,.png'; stage.append(input);
  const openStaging = node('button', 'agent-panel__secondary', 'Add local files in Content'); openStaging.type = 'button';
  openStaging.dataset.agentOpenStaging = '';
  const fileStatus = node('p', 'agent-panel__hint', 'Your files stay on this device. Only a folder or files you choose can be read.');
  if (options.chooseDirectory) files.append(folder);
  if (options.openStaging) files.append(openStaging);
  else if (options.stageFiles) files.append(stage);
  if (options.chooseDirectory || options.stageFiles || options.openStaging) files.append(fileStatus);
  const error = node('p', 'agent-panel__error'); error.hidden = true; error.setAttribute('role', 'alert');
  const recent = node('div', 'agent-panel__recent'); recent.append(node('h3', '', 'Recent activity'));
  const activity = node('ol', 'agent-panel__activity'); activity.dataset.agentActivity = ''; recent.append(activity); recent.hidden = true;
  const disconnect = node('button', 'agent-panel__disconnect', 'Disconnect agent'); disconnect.type = 'button';
  disconnect.dataset.agentDisconnect = ''; disconnect.hidden = true;
  const privacy = node('p', 'agent-panel__privacy', 'Actions and requested canvas images pass through the connection service. Pack contents stay local.');
  root.append(header, intro, status, countdown, target, label, copy, hint, manual, consent, files, error, granted, recent, disconnect, privacy);
  host.append(root);
  let disposed = false, pendingCode: string | undefined, busy = false, copyGeneration = 0;
  let deadline: number | undefined, countdownTimer: ReturnType<typeof setTimeout> | undefined;
  const clearManual = (): void => { manual.value = ''; manual.hidden = true; };
  const expired = (at = deadline): boolean => at !== undefined && at <= Date.now();
  const cancelCopy = (): void => { copyGeneration++; busy = false; clearManual(); copy.textContent = 'Copy connection instructions'; };
  function tick(): void {
    clearTimeout(countdownTimer); countdownTimer = undefined;
    if (disposed || deadline === undefined) { countdown.hidden = true; return; }
    countdown.hidden = false;
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    countdown.textContent = seconds ? `Invitation expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
      : 'Invitation expired. Copy fresh connection instructions.';
    if (!seconds) {
      // A native clipboard prompt can remain pending indefinitely. Expiry must release the retry button,
      // and a late result must not revive the expired instructions or replace a newer attempt.
      cancelCopy(); copy.textContent = 'Copy fresh connection instructions';
      copy.disabled = controller.state().status === 'creating' || controller.state().status === 'connecting';
    }
    else countdownTimer = setTimeout(tick, Math.min(1000, deadline - Date.now()));
  }
  function render(state: AgentPanelState): void {
    if (disposed) return;
    root.dataset.state = state.status; statusText.textContent = STATES[state.status]; target.textContent = state.target;
    disconnect.hidden = state.status === 'idle' || state.status === 'disconnected';
    if (Number.isFinite(state.expiresAt)) deadline = state.expiresAt;
    else if (!expired() || state.status !== 'disconnected') deadline = undefined;
    if (['paused', 'disconnected', 'connected', 'error'].includes(state.status)) {
      clearManual();
      if (!expired()) cancelCopy();
    }
    tick();
    copy.disabled = busy || state.status === 'creating' || state.status === 'connecting';
    error.hidden = !state.error; error.textContent = state.error ?? '';
    consent.hidden = !state.pending || state.status !== 'approval';
    if (state.pending) {
      client.textContent = state.pending.clientName; comparison.textContent = state.pending.comparisonCode;
      if (pendingCode !== state.pending.comparisonCode) {
        pendingCode = state.pending.comparisonCode; checks.clear(); rowViews.length = 0;
        permissions.replaceChildren(node('legend', '', 'Choose what it can do'));
        // FUI-25: all of them, in the labels' order. The connection grants only what the agent asked for
        // (connection.ts `approve` drops the rest), so an unrequested row is shown disabled, never offered.
        for (const permission of AGENT_PERMISSIONS) {
          const requested = state.pending.permissions.includes(permission);
          const row = node('label', 'agent-panel__permission'); const check = node('input');
          row.dataset.permission = permission;
          check.type = 'checkbox'; check.value = permission; check.checked = requested && permission === 'inspect'; check.disabled = !requested;
          const stateText = node('span', 'agent-panel__permission-state');
          const view = { permission, row, check, requested, stateText };
          rowViews.push(view); if (requested) checks.set(permission, check);
          check.addEventListener('change', paintRows);
          row.append(check, node('span', '', LABELS[permission]), stateText); permissions.append(row);
        }
        paintRows();
      }
    } else pendingCode = undefined;
    // FUI-25: the connected state names every permission, granted or not.
    const live = ['connected', 'connecting', 'paused'].includes(state.status) && state.permissions.length > 0;
    granted.hidden = !live;
    grantedList.replaceChildren(...(live ? AGENT_PERMISSIONS.map(permission => {
      const yes = state.permissions.includes(permission);
      const li = node('li', yes ? 'agent-panel__granted-yes' : 'agent-panel__granted-no', `${LABELS[permission]} — ${yes ? 'Granted' : 'Not granted'}`);
      li.dataset.permission = permission; li.dataset.granted = String(yes); return li;
    }) : []));
    const rows: readonly { text: string; kind: 'success' | 'error' | 'info'; code?: string }[] = options.activity ? options.activity.entries() : state.activity;
    recent.hidden = rows.length === 0;
    activity.replaceChildren(...rows.slice(-8).reverse().map(item => {
      const li = node('li', `agent-panel__activity-${item.kind}`, item.text);
      if (item.code) li.dataset.agentCode = item.code;
      return li;
    }));
  }
  const unsubscribe = controller.subscribe(render); render(controller.state());
  const unsubscribeActivity = options.activity?.subscribe(() => render(controller.state())) ?? (() => undefined);
  copy.addEventListener('click', () => { void (async () => {
    if (busy || disposed) return;
    const mine = ++copyGeneration, client = select.value as AgentClient;
    const current = (): boolean => !disposed && mine === copyGeneration && select.value === client;
    busy = true; clearManual();
    copy.disabled = true; copy.textContent = 'Preparing…';
    try {
      const text = await controller.prepare(client);
      if (!current()) return;
      const preparedDeadline = controller.state().expiresAt;
      try {
        if (expired(preparedDeadline)) { tick(); return; }
        // The clipboard may wait for browser focus or permission without resolving or rejecting.
        // Make the current invitation usable immediately; never imply an old clipboard value is ready.
        manual.value = text; manual.hidden = false;
        copy.textContent = 'Copying… You can copy the instructions below';
        await (options.copy ?? (value => navigator.clipboard.writeText(value)))(text);
        if (!current()) return;
        if (expired(preparedDeadline)) { tick(); return; }
        clearManual(); copy.textContent = 'Copied — paste into your agent';
      } catch {
        if (!current()) return;
        if (expired(preparedDeadline)) { tick(); return; }
        manual.value = text; manual.hidden = false; manual.focus(); manual.select();
        copy.textContent = 'Select and copy the instructions below';
      }
    } catch (e) {
      if (current()) { clearManual(); error.textContent = e instanceof Error ? e.message : 'Could not prepare the connection.'; error.hidden = false; copy.textContent = 'Try connection again'; }
    } finally { if (current()) { busy = false; copy.disabled = controller.state().status === 'connecting'; } }
  })(); });
  select.addEventListener('change', () => { cancelCopy(); copy.disabled = false; });
  approve.addEventListener('click', () => controller.approve([...checks].filter(([, check]) => check.checked).map(([permission]) => permission)));
  deny.addEventListener('click', () => controller.deny());
  shortToggle.addEventListener('change', () => {
    shortForm = shortToggle.checked; paintRows();
    try { pageSettings.set(SHORT_FORM_KEY, shortForm ? '1' : '0'); } catch { /* per-viewer convenience only */ }
  });
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
  return { dispose() { if (disposed) return; disposed = true; cancelCopy(); clearTimeout(countdownTimer); unsubscribe(); unsubscribeActivity(); root.remove(); } };
}
