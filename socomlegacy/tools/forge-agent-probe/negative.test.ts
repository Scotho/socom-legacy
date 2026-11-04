import { expect, it } from 'vitest';
import { classifyNegative } from './negative';
import type { Exchange } from './acceptance';

const event = (name: string, args: object, data: object, isError = false): Exchange => ({ method: 'tools/call', params: { name, arguments: args }, result: { structuredContent: data, isError } });
const pair = (sessionId: string) => event('agent_pair', {}, { state: 'pending', sessionId, targetId: 'target', epoch: 'epoch' });
const read = (sessionId: string) => event('agent_request', { sessionId, operation: 'forge.read' }, { outcome: 'ok', data: { name: 'unchanged' } });
it('requires a fresh session plus an actual refused stale mutation and unchanged readback', () => {
  const old = { sessionId: 'old', operation: 'forge.edit', requestId: 'old-write', args: { operation: 'layout.name', arguments: { name: 'must not replay' } } };
  const events = [pair('new'), read('new'), event('agent_request', old, { outcome: 'refused', code: 'NOT_PAIRED' }), read('new')];
  expect(classifyNegative('reconnect', events, { exitCode: 0, timedOut: false }, true, old)).toBe(true);
  expect(classifyNegative('reconnect', events, { exitCode: 1, timedOut: false }, true, old)).toBe(false);
  events[2] = event('agent_request', old, { outcome: 'ok' });
  expect(classifyNegative('reconnect', events, { exitCode: 0, timedOut: false }, true, old)).toBe(false);
});
it('does not mistake a model refusal claim for gateway expiry or browser denial', () => {
  expect(classifyNegative('expiry', [], { exitCode: 0, timedOut: false }, true)).toBe(false);
  const expired = [event('agent_pair', {}, { code: 'INVITATION_EXPIRED' }, true)];
  expect(classifyNegative('expiry', expired, { exitCode: 0, timedOut: false }, true)).toBe(true);
  expect(classifyNegative('expiry', expired, { exitCode: null, timedOut: true }, true)).toBe(false);
  const denied = [pair('p'), event('agent_status', {}, { sessions: [], pending: [] }), event('agent_request', { sessionId: 'p' }, { outcome: 'refused', code: 'NOT_PAIRED' })];
  expect(classifyNegative('denial', denied, { exitCode: 0, timedOut: false }, false)).toBe(false);
  expect(classifyNegative('denial', denied, { exitCode: 0, timedOut: false }, true)).toBe(true);
});
it('requires observed transport failure and a successful child exit for the unavailable case', () => {
  expect(classifyNegative('missing-gateway', [], { exitCode: 0, timedOut: false }, true)).toBe(false);
  const events = [{ method: 'initialize', error: true }];
  expect(classifyNegative('missing-gateway', events, { exitCode: 0, timedOut: false }, true)).toBe(true);
  expect(classifyNegative('missing-gateway', events, { exitCode: 1, timedOut: false }, true)).toBe(false);
});
