import { identifier, PERMISSIONS, type Permission } from '@s2u/forge-agent-protocol';
import { pageSettings } from '../pageStore';

/**
 * AX-10 (a browser adaptation, AX.R2): the agents this browser was asked to remember -- per viewer, on localStorage
 * through `../pageStore` (in its inventory), and right without storage: a read that fails is an empty list (every
 * pairing shows the full consent card), a write that fails changes nothing else. A remembered agent's next pairing is
 * still one explicit Allow (`./panel`); nothing here approves anything.
 */
export const AGENT_REMEMBERED_KEY = 'forge.agent.remembered';
/** How many agents one browser keeps (the oldest goes first). */
export const AGENT_REMEMBERED_LIMIT = 16;
export interface RememberedAgent {
  /** The name the agent reported (shown; matched only when this entry has no client id). */
  clientName: string;
  /** The gateway's OAuth client id from the `pending` signal (AX-10, additive), matched first when present. */
  gatewayClientId?: string;
  /** What the person allowed the last time, in the permissions' order. */
  grants: Permission[];
  rememberedAt: number;
}
export interface AgentIdentity { clientName: string; gatewayClientId?: string }

function valid(v: unknown): v is RememberedAgent {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return typeof e.clientName === 'string' && e.clientName.length > 0 && e.clientName.length <= 100
    && (e.gatewayClientId === undefined || identifier(e.gatewayClientId))
    && Array.isArray(e.grants) && e.grants.every((p) => PERMISSIONS.includes(p as Permission))
    && typeof e.rememberedAt === 'number' && Number.isFinite(e.rememberedAt);
}
/** Every remembered agent, most recent first; [] when storage is blocked, empty or unreadable. */
export function rememberedAgents(): RememberedAgent[] {
  let value: string | null = null;
  try { value = pageSettings.get(AGENT_REMEMBERED_KEY); } catch { return []; }
  if (!value) return [];
  try {
    const list: unknown = JSON.parse(value);
    return Array.isArray(list) ? list.filter(valid).slice(0, AGENT_REMEMBERED_LIMIT) : [];
  } catch { return []; }
}
/**
 * Whether `entry` is the agent `who` names. An entry that carries the gateway's client id matches only a pending with
 * the same id -- a pending with none, or another, is a different agent whatever its name (REVIEW-1 finding 8: a name is
 * the agent's own report). An entry without an id (remembered through an older gateway) matches by the reported name.
 */
export function sameAgent(entry: RememberedAgent, who: AgentIdentity): boolean {
  if (entry.gatewayClientId) return who.gatewayClientId === entry.gatewayClientId;
  return entry.clientName === who.clientName;
}
/** REVIEW-1 finding 8: whether a match was by the gateway's client id (not the reported name alone). */
export function matchedById(entry: RememberedAgent, who: AgentIdentity): boolean {
  return !!entry.gatewayClientId && entry.gatewayClientId === who.gatewayClientId;
}
export function findRememberedAgent(who: AgentIdentity): RememberedAgent | undefined {
  return rememberedAgents().find((e) => sameAgent(e, who));
}
function write(list: RememberedAgent[]): boolean {
  try {
    const written = list.length ? pageSettings.set(AGENT_REMEMBERED_KEY, JSON.stringify(list)) : pageSettings.remove(AGENT_REMEMBERED_KEY);
    return written.ok;
  } catch { return false; }
}
/** Remembers (or refreshes) `who` with `grants`; false when the browser refused the write. */
export function rememberAgent(who: AgentIdentity, grants: readonly Permission[], now = Date.now()): boolean {
  const entry: RememberedAgent = {
    clientName: who.clientName.slice(0, 100),
    ...(identifier(who.gatewayClientId) ? { gatewayClientId: who.gatewayClientId } : {}),
    grants: PERMISSIONS.filter((p) => grants.includes(p)),
    rememberedAt: now,
  };
  return write([entry, ...rememberedAgents().filter((e) => !sameAgent(e, entry))].slice(0, AGENT_REMEMBERED_LIMIT));
}
/** Forgets the one entry (matched exactly by name, id and time); false when the browser refused the write. */
export function forgetRememberedAgent(entry: RememberedAgent): boolean {
  return write(rememberedAgents().filter((e) => !(e.clientName === entry.clientName && e.gatewayClientId === entry.gatewayClientId
    && e.rememberedAt === entry.rememberedAt)));
}
