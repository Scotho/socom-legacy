/**
 * FP-14 (FP.R10; a browser adaptation, FG.R2 -- the agent connection has no original), reworked by AX-U (AX.R2, AX.R3,
 * AX.R7, C6: one link, all ticked, three moments): the connection's words and commands, shared by the Forge's and the test room's panel (`./panel`) and the public setup page
 * (`./setupPage`). Nothing here imports the connection, so the public page loads without it. Every value is a browser
 * adaptation: the client commands are each client's own documented MCP command forms (see the compatibility record,
 * `docs/specs/2026-10-24-forge-agent-compatibility.md`).
 */
import { pageSettings } from '../pageStore';

/** The four clients the agent picker offers (FP.R10 adds Claude Desktop, listed but unmeasured: the compatibility record). */
export type AgentClient = 'claude' | 'codex' | 'desktop' | 'other';
export const AGENT_CLIENTS: readonly { readonly id: AgentClient; readonly label: string; readonly guide: string }[] = [
  { id: 'claude', label: 'Claude Code', guide: 'claude-code' },
  { id: 'codex', label: 'Codex', guide: 'codex' },
  { id: 'desktop', label: 'Claude Desktop', guide: 'claude-desktop' },
  { id: 'other', label: 'Another MCP client', guide: 'other' },
];

/**
 * A browser adaptation (FP.R10): the modding wiki's base, under which FP-13 writes one agent page per client
 * (`shared/modding-wiki/content/docs/connect/<client>.mdx`, served at `/connect/<client>/`: the wiki sets
 * `trailingSlash: true`). The guide line builds the address without the trailing slash and the wiki redirects it. The
 * deployed wiki today (`socom2legacy-modding.pages.dev`, the forge-path design's survey); FP-13 fills the final address
 * (the custom domain is H410's). The ~150 words of agent instructions the copied text once carried live there.
 */
export const AGENT_GUIDE_URL_ADAPTATION = 'https://socom2legacy-modding.pages.dev';
/**
 * FP-14's fold N1 (FP.R10: measured before it is listed as working): what the disclosure and `/agent` say when Claude Desktop is
 * chosen -- FP-13's guide page's own words, so the panel and the guide agree.
 */
export const AGENT_CLIENT_NOTES: Partial<Record<AgentClient, string>> = { desktop: 'Claude Desktop: listed, not yet measured.' };
/** The MCP server's name in every client's configuration. */
export const AGENT_SERVER_NAME = 'socom2legacy';
/**
 * LATER 423 (fixed by FP-14; a browser adaptation): the page's own connection service address, the Connect moment's
 * "Connection service" field, beside the build's VITE_S2U_AGENT_URL (which wins). In `../pageStore`'s inventory.
 */
export const AGENT_GATEWAY_KEY = 'forge.agent.gateway';
/** Where the address in use came from: the build, the page's setting, or the default (the loopback or the origin). */
export type AgentGatewaySource = 'build' | 'page' | 'default';
/** The build's environment as `import.meta.env` gives it. */
export type AgentBuildEnv = { readonly [key: string]: unknown; readonly DEV?: boolean };
const envText = (value: unknown): string => (typeof value === 'string' ? value : '');
const usable = (value: string | null): string | null => {
  if (!value) return null;
  try { return safeGateway(value).origin; } catch { return null; }
};
/** LATER 423 (FP-14): the page's stored connection service address, when the connection's URL rule takes it; else null. */
export function storedAgentGateway(): string | null {
  let value: string | null = null;
  try { value = pageSettings.get(AGENT_GATEWAY_KEY); } catch { /* the page is right without storage */ }
  return usable(value);
}
/** LATER 423: where the gateway in use comes from (the build's address wins over the page's). */
export function agentGatewaySource(env: AgentBuildEnv = import.meta.env, stored: string | null = storedAgentGateway()): AgentGatewaySource {
  return envText(env['VITE_S2U_AGENT_URL']) ? 'build' : usable(stored) ? 'page' : 'default';
}
/**
 * Whether the agent panel checks the connection service's `GET /health` on its first showing: yes where an address is
 * set (the build's, the page's) and in a release (the page's own origin); not at the development default loopback,
 * where the optional service usually does not run and a refused GET is a console error on the page (viewer.spec.ts at
 * agent/mega 7cd782a5f). A Retry still checks. A browser adaptation.
 */
export function agentHealthOnShow(env: AgentBuildEnv = import.meta.env, stored: string | null = storedAgentGateway()): boolean {
  return !(env.DEV && agentGatewaySource(env, stored) === 'default');
}
/** LATER 423: the gateway -- VITE_S2U_AGENT_URL, else the page's setting, else the loopback in development, else `origin`. */
export function agentGatewayFor(origin: string, env: AgentBuildEnv = import.meta.env, stored: string | null = storedAgentGateway()): string {
  return envText(env['VITE_S2U_AGENT_URL']) || usable(stored) || (env.DEV ? 'http://127.0.0.1:5360' : origin);
}

/** The client's agent page on the wiki (FP.R10); since AX-U the copied line no longer carries it (the join page does). */
export function agentGuideLine(client: AgentClient): string {
  const entry = AGENT_CLIENTS.find((c) => c.id === client) ?? AGENT_CLIENTS[3]!;
  return `Agent: read ${AGENT_GUIDE_URL_ADAPTATION}/connect/${entry.guide}`;
}

/**
 * The connection service's address checked (https, or http on this device; its origin or its `/mcp` path; no
 * credentials, query or fragment), as its origin.
 */
export function safeGateway(value: string): URL {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash)
    throw new Error('Use a connection service URL without credentials, query or fragment.');
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
    throw new Error('The connection service must use HTTPS (HTTP is allowed only on this device).');
  if (url.pathname !== '/' && url.pathname !== '/mcp') throw new Error('Use the connection service origin or its /mcp address.');
  return new URL(url.origin);
}

/** The gateway's MCP endpoint, shown on screen (the Connect moment's "Connection service" disclosure, `/agent`). */
export function agentEndpoint(address: string): string {
  return `${safeGateway(address).origin}/mcp`;
}

/** One copyable row of step 1: its caption and its exact text. */
export interface AgentSetupRow { readonly caption: string; readonly text: string }
/**
 * A client's setup rows (the "First time with <client>?" disclosure and `/agent`): the human's commands only (FP.R10),
 * each copied whole; the first row's Copy is the disclosure's own. Claude Code: the user scope, then the local scope (LATER 425). Codex: add, then log in.
 * Claude Desktop: a `claude_desktop_config.json` entry through the `mcp-remote` bridge (the config file starts local
 * command servers; listed, unmeasured). Another client: the endpoint, a Streamable HTTP server.
 */
export function agentSetupRows(client: AgentClient, address: string): AgentSetupRow[] {
  const endpoint = agentEndpoint(address), name = AGENT_SERVER_NAME;
  switch (client) {
    case 'claude': return [
      { caption: 'Every project', text: `claude mcp add --transport http --scope user ${name} ${endpoint}` },
      { caption: 'Or this project only', text: `claude mcp add --transport http --scope local ${name} ${endpoint}` },
    ];
    case 'codex': return [{ caption: 'Add and log in', text: `codex mcp add ${name} --url ${endpoint}\ncodex mcp login ${name}` }];
    case 'desktop': return [{ caption: 'claude_desktop_config.json',
      text: JSON.stringify({ mcpServers: { [name]: { command: 'npx', args: ['-y', 'mcp-remote', endpoint] } } }, null, 2) }];
    default: return [{ caption: `Streamable HTTP server "${name}"`, text: endpoint }];
  }
}

/**
 * AX-U (AX.R2, C6): the sign-in line under each client's setup command in the "First time with <client>?" disclosure --
 * what its authorization looks like (the gateway's guest consent page, scope `bootstrap`). FP-14's step 2 words, kept.
 */
export const AGENT_AUTHORIZE_WORDS: Record<AgentClient, string> = {
  claude: 'Then sign in: run /mcp in Claude Code and choose socom2legacy. Your browser opens the connection service’s guest sign-in.',
  codex: 'Then sign in: codex mcp login socom2legacy opens the connection service’s guest sign-in in your browser.',
  desktop: 'Then restart Claude Desktop. The bridge opens the connection service’s guest sign-in in your browser.',
  other: 'Then sign in when your client asks. Your browser opens the connection service’s guest sign-in.',
};

/**
 * AX-U (C6; a browser adaptation): the one copied line's opening words; the line is these, then the join link. The
 * same for every client (AX.R2: the agent asks for everything and the player opts out on the page), and nothing else.
 */
export const AGENT_CONNECT_LINE_PREFIX = 'Connect to my SOCOM 2 Legacy page: ';
/** The protocol's identifier form (`@s2u/forge-agent-protocol` `identifier`): only such an invitation goes in a link. */
const INVITATION = /^[A-Za-z0-9_.:-]{1,128}$/;
/** AX-U (C6): the gateway's join link for an invitation -- `<gateway origin>/join/<invitation>`. */
export function agentJoinLink(address: string, invitation: string): string {
  const origin = safeGateway(address).origin;
  if (!INVITATION.test(invitation)) throw new Error('The connection service returned an unusable invitation.');
  return `${origin}/join/${invitation}`;
}
/** AX-U (C6): the copied text, one line: `Connect to my SOCOM 2 Legacy page: <gateway>/join/<invitation>`. */
export function pairingText(address: string, invitation: string): string {
  return `${AGENT_CONNECT_LINE_PREFIX}${agentJoinLink(address, invitation)}`;
}
/** The invitation at the end of a copied line or a bare join link; null for any other text. */
export function pairingInvitation(text: string): string | null {
  const m = /(?:^|\s)(https?:\/\/[^\s/?#]+)\/join\/([A-Za-z0-9_.:-]{1,128})$/.exec(text.trim());
  return m ? m[2]! : null;
}

/** AX-U: the Connect moment's one primary button (the probe and the e2e specs press it by this name). */
export const AGENT_COPY_LINK_LABEL = 'Copy connect link';
/** AX-U: the Allow moment's primary button (the probe and the e2e specs press it by this name). */
export const AGENT_ALLOW_LABEL = 'Allow';

/**
 * AX-U (a browser adaptation): the "First time with <client>?" disclosure's per-viewer flag -- the clients this browser
 * has paired at least once, most recent first, comma-separated. In `../pageStore`'s inventory; right without storage.
 */
export const AGENT_PAIRED_CLIENTS_KEY = 'forge.agent.pairedClients';
const CLIENT_IDS = AGENT_CLIENTS.map((c) => c.id);
function pairedClients(): AgentClient[] {
  let value: string | null = null;
  try { value = pageSettings.get(AGENT_PAIRED_CLIENTS_KEY); } catch { /* the page is right without storage */ }
  return (value ?? '').split(',').filter((id): id is AgentClient => (CLIENT_IDS as string[]).includes(id));
}
/** Whether this browser has paired `client` once (the disclosure then starts folded). */
export function agentClientPaired(client: AgentClient): boolean { return pairedClients().includes(client); }
/** The client this browser paired last (the picker starts on it), or null. */
export function lastPairedAgentClient(): AgentClient | null { return pairedClients()[0] ?? null; }
/** Records a pairing with `client`, most recent first; a refused write is the store's to report. */
export function rememberAgentClientPaired(client: AgentClient): void {
  const list = [client, ...pairedClients().filter((c) => c !== client)];
  try { pageSettings.set(AGENT_PAIRED_CLIENTS_KEY, list.join(',')); } catch { /* per-viewer convenience only */ }
}

/** AX-U's three moments, in order: Connect, Allow, Connected (the stepper's four steps are gone, AX.R5). */
export type AgentStage = 'connect' | 'allow' | 'connected';
export const AGENT_STAGES: readonly { readonly id: AgentStage; readonly title: string }[] = [
  { id: 'connect', title: 'Connect' }, { id: 'allow', title: 'Allow' }, { id: 'connected', title: 'Connected' },
];
export const agentStageTitle = (stage: AgentStage): string => AGENT_STAGES.find((s) => s.id === stage)!.title;
const STAGE_FAILED: Record<AgentStage, string> = { connect: 'Connect failed', allow: 'Approval failed', connected: 'Connection lost' };

type Status = 'idle' | 'creating' | 'waiting' | 'approval' | 'connecting' | 'connected' | 'paused' | 'disconnected' | 'error';
/**
 * The moment a connection's state shows. An error shows the moment it came from (`from`, the last state before it): a
 * registration or an invitation is Connect's, an approval Allow's, a session being made or live Connected's.
 */
export function agentStageFor(status: Status, from: Status = 'idle'): AgentStage {
  const at = status === 'error' ? from : status;
  if (at === 'approval') return 'allow';
  if (at === 'connecting' || at === 'connected' || at === 'paused') return 'connected';
  return 'connect';
}
/** An error's words with the stage that failed named first (MC-12's rule): "Connect failed: ...". */
export function agentStageError(stage: AgentStage, message: string): string {
  return `${STAGE_FAILED[stage]}: ${message}`;
}

/**
 * The pad's prompts (MCW.R10 pad reach; drawn once at the card's foot). FP-14's fold N2: only what the dock's pad focus
 * really does (`../forge/shell/padFocus.ts` `input`: the d-pad moves the focus, Cross presses the held control; Circle
 * is not taken there), so every moment says the same two.
 */
const PAD_PROMPTS = [{ glyph: 'dpad-v', label: 'Move' }, { glyph: 'cross', label: 'Select' }] as const;
export const AGENT_STAGE_LEGEND: Record<AgentStage, readonly { glyph: 'cross' | 'dpad-v'; label: string }[]> = {
  connect: PAD_PROMPTS, allow: PAD_PROMPTS, connected: PAD_PROMPTS,
};
