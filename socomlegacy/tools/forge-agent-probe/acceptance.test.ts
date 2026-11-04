import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classify, failurePhase, safeReport, type Exchange } from './acceptance';

const text = (data: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data });
const event = (name: string, args: object, data: unknown): Exchange => ({ method: 'tools/call', params: { name, arguments: args }, result: text(data) });
let sequence = 0;
const call = (operation: string, args: object, data: object, revision = 1): Exchange => event('agent_request', { version: 1, requestId: `test-${sequence++}`, operation, args, expectedRevision: revision, sessionId: 's', targetId: 'target', epoch: 'epoch' }, { outcome: 'ok', revision: revision + 1, data });
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
function complete(): Exchange[] {
  return [
    { method: 'tools/list', result: { tools: ['agent_capabilities', 'agent_status', 'agent_pair', 'agent_request', 'agent_disconnect'].map(name => ({ name })) } },
    event('agent_capabilities', {}, { operations: { 'forge.read': {} } }),
    event('agent_pair', {}, { state: 'pending', sessionId: 's', targetId: 'target', epoch: 'epoch' }),
    call('forge.read', { section: 'metadata' }, { name: 'FCW baseline' }),
    call('forge.edit', { operation: 'layout.name', arguments: { name: 'FCW acceptance edited' } }, {}),
    call('forge.read', { section: 'metadata' }, { name: 'FCW acceptance edited' }),
    call('forge.undo', {}, {}), call('forge.read', { section: 'metadata' }, { name: 'FCW baseline' }),
    { ...call('target.capture', {}, {}), result: { ...text({ outcome: 'ok' }), content: [{ type: 'image', mimeType: 'image/png', data: png }] } },
    call('packs.list', {}, { items: [{ id: 'staged:fixture', staged: true, name: 'fcw.json' }] }),
    call('packs.import', { kind: 'map', stagedId: 'staged:fixture', apply: true }, { id: 'map:fixture', stored: true, applied: true }),
    call('forge.read', { section: 'metadata' }, { name: 'FCW imported fixture' }),
    call('packs.remove', { id: 'map:fixture' }, { id: 'map:fixture', removed: true, stored: false, applied: false }),
    call('packs.list', {}, { items: [] }),
    event('agent_disconnect', { sessionId: 's' }, { disconnected: true }),
    { ...call('forge.read', {}, {}), result: text({ outcome: 'refused', code: 'NOT_PAIRED' }) },
  ];
}
describe('real-client creator-loop evidence classification', () => {
  it('requires observed tool results, browser approval and readbacks', () => {
    expect(classify(complete(), { exitCode: 0, approved: true }).status).toBe('pass');
    expect(classify(complete(), { exitCode: 0, approved: false }).status).toBe('fail');
    expect(classify(complete().slice(0, 3), { exitCode: 0, approved: true }).status).toBe('fail');
  });
  it('native discovery requires successful results from every actual tool, without fabricating tools/list', () => {
    const events = complete().slice(1);
    events.splice(2, 0, event('agent_status', {}, { sessions: [{}] }));
    expect(classify(events, { exitCode: 0, approved: true }, 'native-client-results').status).toBe('pass');
    expect(classify(events.filter(e => e.params?.name !== 'agent_disconnect'), { exitCode: 0, approved: true }, 'native-client-results').checks.discovery).toBe(false);
    expect(classify(events, { exitCode: 0, approved: true }).checks.discovery).toBe(false);
  });
  it('fails a child crash or timeout even after successful tools', () => {
    expect(classify(complete(), { exitCode: 1, approved: true }).status).toBe('fail');
    expect(classify(complete(), { exitCode: null, approved: true, timedOut: true }).status).toBe('fail');
  });
  it('fails missing or invalid image data instead of counting the model claim', () => {
    for (const content of [[], [{ type: 'text', text: 'I saw the screenshot' }], [{ type: 'image', mimeType: 'image/png', data: 'not-a-png' }]]) {
      const events = complete(); events[8]!.result = { ...text({ outcome: 'ok' }), content };
      expect(classify(events, { exitCode: 0, approved: true }).checks.image).toBe(false);
    }
  });
  it('does not accept a stored-but-unapplied import, removal refusal, or wrong readback', () => {
    for (const [index, result] of [[10, { outcome: 'ok', data: { stored: true, applied: false, id: 'map:fixture' } }], [12, { outcome: 'refused', code: 'UNSUPPORTED_SURFACE' }], [11, { outcome: 'ok', data: { name: 'Before' } }]] as const) {
      const events = complete(); events[index]!.result = text(result);
      expect(classify(events, { exitCode: 0, approved: true }).status).toBe('fail');
    }
  });
  it('requires ordered undo readback and disconnect revocation, not unordered tool presence', () => {
    const events = complete(); [events[6], events[7]] = [events[7]!, events[6]!];
    expect(classify(events, { exitCode: 0, approved: true }).checks.undo).toBe(false);
    const alive = complete(); alive[15] = call('forge.read', {}, {});
    expect(classify(alive, { exitCode: 0, approved: true }).checks.disconnect).toBe(false);
  });
  it('persists only allowlisted evidence, never arbitrary errors, paths, tokens or image bytes', () => {
    const synthetic = ['secret', 'value'].join('-');
    const report = safeReport({ client: 'codex', classification: classify(complete(), { exitCode: 0, approved: true }),
      error: `Bearer ${synthetic} ${join(tmpdir(), 'private-example')}`, transcript: complete(), access_token: synthetic });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/secret-value|Bearer|Someone|private|iVBOR|session|target/);
    expect(report.evidence).toBe('actual-cli-via-loopback-proxy');
    expect(report.unmeasured).toContain('copied-blurb-oauth');
  });
  it('reports fixed failure phases without persisting raw child or tool errors', () => {
    expect(failurePhase(classify([], { exitCode: 0, approved: false }))).toBe('TOOL_DISCOVERY');
    expect(failurePhase(classify(complete(), { exitCode: 7, approved: true }))).toBe('CLIENT_EXECUTION');
    const events = complete(); events[12]!.result = text({ outcome: 'refused', code: 'UNSUPPORTED_SURFACE' });
    expect(failurePhase(classify(events, { exitCode: 0, approved: true }))).toBe('REMOVE_READBACK');
  });
  it('binds revocation to an exact valid forge.read request for the just-disconnected page', () => {
    for (const change of [{ sessionId: 'x' }, { targetId: 'wrong' }, { epoch: 'wrong' }, { operation: 'forge.edit' }, { version: 2 }, { requestId: '' }]) {
      const events = complete(); Object.assign(events[15]!.params!.arguments, change);
      expect(classify(events, { exitCode: 0, approved: true }).checks.disconnect).toBe(false);
    }
    const replay = complete(); replay.splice(15, 0, call('forge.read', {}, {}));
    expect(classify(replay, { exitCode: 0, approved: true }).checks.disconnect).toBe(false);
  });
  it('requires the known fixture baseline and binds all accepted operations to the approved page', () => {
    for (const index of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      const events = complete(); events[index]!.params!.arguments.sessionId = 'x';
      expect(classify(events, { exitCode: 0, approved: true }).status).toBe('fail');
    }
    const wrong = complete(); wrong[3]!.result = text({ outcome: 'ok', data: { name: 'unrelated workspace' } });
    wrong[7]!.result = text({ outcome: 'ok', data: { name: 'unrelated workspace' } });
    expect(classify(wrong, { exitCode: 0, approved: true }).checks.read).toBe(false);
  });
});
