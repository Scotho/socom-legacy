/** Product adaptation: expected refusals still require real recorded responses and a healthy child. */
import { payload, type Exchange } from './acceptance';
const canonical = (value: any): string => JSON.stringify(value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(item => JSON.parse(canonical(item))) : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])) : value);
export function classifyNegative(name: 'reconnect' | 'denial' | 'expiry' | 'missing-gateway', events: readonly Exchange[],
  child: { exitCode: number | null; timedOut: boolean; outputError?: boolean }, browserAction: boolean, old?: Record<string, any>): boolean {
  if (child.exitCode !== 0 || child.timedOut || child.outputError || !browserAction) return false;
  const call = (tool: string) => (e: Exchange) => e.method === 'tools/call' && e.params?.name === tool;
  if (name === 'missing-gateway') return events.some(e => e.error) && !events.some(e => call('agent_request')(e) && payload(e)?.outcome === 'ok');
  if (name === 'expiry') return events.some(e => call('agent_pair')(e) && payload(e)?.code === 'INVITATION_EXPIRED')
    && !events.some(e => call('agent_pair')(e) && payload(e)?.state === 'pending');
  const pair = events.find(e => call('agent_pair')(e) && payload(e)?.state === 'pending');
  if (!pair) return false;
  const session = payload(pair).sessionId;
  if (name === 'denial') return events.some(e => call('agent_status')(e) && payload(e)?.sessions?.length === 0)
    && events.some(e => call('agent_request')(e) && e.params?.arguments?.sessionId === session && payload(e)?.code === 'NOT_PAIRED')
    && !events.some(e => call('agent_request')(e) && payload(e)?.outcome === 'ok');
  if (!old || old.sessionId === session) return false;
  const beforeIndex = events.findIndex(e => call('agent_request')(e) && e.params?.arguments?.sessionId === session
    && e.params?.arguments?.operation === 'forge.read' && payload(e)?.outcome === 'ok' && typeof payload(e)?.data?.name === 'string');
  const refusedIndex = events.findIndex((e, index) => index > beforeIndex && call('agent_request')(e)
    && canonical(e.params?.arguments) === canonical(old) && payload(e)?.outcome === 'refused' && payload(e)?.code === 'NOT_PAIRED');
  if (beforeIndex < 0 || refusedIndex < 0) return false;
  return events.some((e, index) => index > refusedIndex && call('agent_request')(e) && e.params?.arguments?.sessionId === session
    && e.params?.arguments?.operation === 'forge.read' && payload(e)?.outcome === 'ok' && payload(e)?.data?.name === payload(events[beforeIndex]).data.name);
}
