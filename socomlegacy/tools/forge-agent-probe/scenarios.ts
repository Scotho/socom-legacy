/** Product adaptation: prompts are tasks for actual installed clients; assertions use recorded responses. */
import { BASELINE } from './browser';
export const CASES = ['creator', 'reconnect', 'denial', 'expiry', 'missing-gateway'] as const;
export type CaseName = typeof CASES[number];
export const MCP_RULES = `Use only socom2legacy MCP operations. The client's read-only tool discovery/search may locate exactly these tools: agent_capabilities, agent_status, agent_pair, agent_request, agent_disconnect.
If those tools are deferred, discover them before calling agent_capabilities. Never use shell, local file tools, web search, other apps, or Play. Do not write any configuration.
Discover agent_capabilities FIRST, then pair. Use agent_status to poll until paired (with a short delay if necessary).
agent_pair returns sessionId,targetId,epoch. Include version:1 and these fields in each agent_request, unique requestId per request.
Before EVERY mutation, get target.status and use that response's revision as expectedRevision. Never guess IDs, revisions or schemas.
Inspect agent_capabilities for argument schemas. If a step fails or an outcome is unknown, report failure and stop, do not claim success.`;
export function creatorPrompt(code: string): string {
  return `${MCP_RULES}
Call agent_pair with invitation ${JSON.stringify(code)}, clientName:"FCW actual client", permissions:["inspect","edit","capture","import"]. The harness will compare the code and approve in the browser.
After approval perform these steps in order:
1. forge.read {section:"metadata"}; baseline name must be ${JSON.stringify(BASELINE)}.
2. forge.edit {operation:"layout.name",arguments:{name:"FCW acceptance edited"}}; forge.read metadata must confirm that name.
3. forge.undo {}; forge.read metadata must confirm ${JSON.stringify(BASELINE)} again.
4. target.capture {}; inspect the returned MCP image. Do not merely describe a text receipt.
5. packs.list {}; discover the staged fcw.json map ID.
6. packs.import {kind:"map",stagedId:<the actual staged ID>,apply:true}; require stored:true and applied:true; remember its returned map ID.
7. forge.read metadata must confirm "FCW imported fixture".
8. packs.remove {id:<that imported map ID>}; require removed:true,stored:false,applied:false. packs.list must show that imported ID absent.
9. agent_disconnect {sessionId:<this session>}; then send forge.read using the old envelope; require outcome:refused,code:NOT_PAIRED.
Stop and report each failed step honestly.`;
}
export function pairPrompt(code: string, scenario: 'denial' | 'expiry'): string {
  return `${MCP_RULES}
Call agent_pair with invitation ${JSON.stringify(code)},clientName:"FCW ${scenario}",permissions:["inspect","edit"].
${scenario === 'expiry' ? 'The invitation has actually aged past its lifetime. Require an INVITATION_EXPIRED error; no pairing or mutation may succeed.'
    : 'The harness will DECLINE in the browser. After denial use agent_status and require no active sessions. Send forge.read with the returned pending sessionId,targetId,epoch and require NOT_PAIRED. Do not retry pairing.'}
An expected denial is not permission to change anything.`;
}
export function reconnectPrompt(code: string, oldEnvelope: object): string {
  return `${MCP_RULES}
Call agent_pair with invitation ${JSON.stringify(code)},clientName:"FCW reconnect",permissions:["inspect","edit"]. The browser will approve.
Read forge.read metadata and remember its name. Send exactly this OLD DISCONNECTED envelope through agent_request: ${JSON.stringify(oldEnvelope)}.
Require NOT_PAIRED. Read metadata with the NEW session and require the name unchanged. Do not copy the old command into the new envelope.
Then agent_disconnect the new session. Report failure if the old command ever succeeds.`;
}
export const missingGatewayPrompt = `${MCP_RULES}\nAttempt to discover agent_capabilities. The local gateway is intentionally unavailable. Report its connection failure honestly. Do not invent a tool result or claim the creator loop passed.`;
