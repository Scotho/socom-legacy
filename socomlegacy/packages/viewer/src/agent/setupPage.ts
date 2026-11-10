import './panel.css';
import { element, pageShell } from '../projectSite/components';
import {
  AGENT_AUTHORIZE_WORDS, AGENT_CLIENT_NOTES, AGENT_CLIENTS, AGENT_COPY_LINK_LABEL, agentEndpoint, agentGatewayFor, agentSetupRows,
  agentStageError, type AgentClient,
} from './setup';

/**
 * FP-14 (FP.R10; MC-12's public setup route; a browser adaptation, FG.R2), reworded by AX-U (C6): `/agent`, a project
 * page in the project site's shell (`../projectSite/components` `pageShell`) that works before the Forge is open -- the
 * agent picker, each client's setup commands and sign-in line, then "Open the Forge or the test room and press Copy
 * connect link." Nothing of an invitation, a join link or a token is on it or in a link (MC-12's rule): the link is the
 * open page's. It imports no viewer, renderer, disc or connection module, as the project pages do not.
 */
let pages = 0;
export function agentSetupPage(options: { gateway?: string; copy?: (text: string) => Promise<void> } = {}): HTMLElement {
  const shell = pageShell('agent', 'Connect your agent', 'Forge', 'Add the SOCOM II Legacy connection service to your AI agent once. Then connect it from the Forge or the test room with one link.');
  const main = shell.querySelector('main')!;
  const address = options.gateway ?? agentGatewayFor(location.origin);
  const panel = element('section', 'agent-panel'); panel.setAttribute('aria-label', 'Connect your agent');
  const head = element('div', 'agent-panel__header');
  head.append(element('h2', 'agent-panel__title', 'Set up your agent'));
  const picker = element('div', 'agent-panel__segments'); picker.dataset['agentClientPicker'] = '';
  picker.setAttribute('role', 'radiogroup'); picker.setAttribute('aria-label', 'Your agent');
  const name = `agent-setup-client-${++pages}`;
  for (const c of AGENT_CLIENTS) {
    const seg = element('label', 'agent-panel__segment');
    const radio = element('input') as HTMLInputElement; radio.type = 'radio'; radio.name = name; radio.value = c.id; radio.checked = c.id === 'claude';
    radio.addEventListener('change', () => paint());
    seg.append(radio, element('span', '', c.label)); picker.append(seg);
  }
  const chosen = (): AgentClient => (picker.querySelector<HTMLInputElement>('input:checked')?.value as AgentClient | undefined) ?? 'claude';
  // FP-14 fold N1: a client listed but not yet measured says so beside the picker.
  const note = element('p', 'agent-panel__fine'); note.dataset['agentClientNote'] = ''; note.hidden = true;
  const endpoint = element('p', 'agent-panel__readout');
  const code = element('code', 'agent-panel__code');
  endpoint.append(element('span', 'agent-panel__caption', 'MCP endpoint'), code);
  const rows = element('div', 'agent-panel__rows');
  const signIn = element('p', 'agent-panel__hint'); signIn.dataset['agentSignIn'] = '';
  const next = element('p', 'agent-panel__intro', `Open the Forge or the test room and press ${AGENT_COPY_LINK_LABEL}.`);
  const after = element('p', 'agent-panel__fine', 'Paste that link into your agent, then approve what it can do on the page.');
  panel.append(head, picker, element('p', 'agent-panel__hint', 'Run this once where your agent runs.'), note, rows, signIn, endpoint, next, after);
  const copy = options.copy ?? ((text: string) => navigator.clipboard.writeText(text));
  const paint = (): void => {
    const which = chosen();
    signIn.textContent = AGENT_AUTHORIZE_WORDS[which];
    note.textContent = AGENT_CLIENT_NOTES[which] ?? ''; note.hidden = !AGENT_CLIENT_NOTES[which];
    try { code.textContent = agentEndpoint(address); } catch (e) { code.textContent = agentStageError('connect', e instanceof Error ? e.message : 'The address is not usable.'); }
    let list: ReturnType<typeof agentSetupRows> = [];
    try { list = agentSetupRows(which, address); } catch { /* said above */ }
    rows.replaceChildren(...list.map((row) => {
      const line = element('div', 'fx-field-row agent-panel__row');
      const b = element('button', 'agent-panel__secondary agent-panel__copy', 'Copy') as HTMLButtonElement;
      b.type = 'button'; b.title = 'Copy · Enter'; b.setAttribute('aria-label', `Copy: ${row.caption}`);
      b.addEventListener('click', () => { void copy(row.text).then(() => { b.textContent = 'Copied'; }, () => { b.textContent = 'Select it to copy'; }); });
      line.append(element('span', 'agent-panel__caption', row.caption), element('code', 'agent-panel__code', row.text), b);
      return line;
    }));
  };
  paint();
  main.append(panel);
  return shell;
}
