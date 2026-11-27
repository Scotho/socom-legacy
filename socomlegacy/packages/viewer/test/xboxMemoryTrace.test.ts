import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  XboxMemoryTrace, XBOX_TRACE_EVENTS_ADAPTATION, bufferPayloadBytes, installXboxMemorySink,
  noteXboxMemory, noteXboxWorkerReply,
} from '../src/xboxMemoryTrace';

afterEach(() => installXboxMemorySink(null));

describe('Xbox memory investigation (browser adaptation)', () => {
  it('bounds the record and freezes the last loading stage at the first failure', () => {
    let now = 0;
    const trace = new XboxMemoryTrace({ now: () => ++now, heap: () => ({ usedJSHeapSize: 1024 }), save: () => {} });
    trace.note('load:world-built');
    for (let i = 0; i < 1000; i++) trace.note('sample');
    expect(trace.report().events).toHaveLength(XBOX_TRACE_EVENTS_ADAPTATION);
    trace.note('graphics-lost', {}, true);
    const failed = trace.report();
    trace.note('sample');
    trace.note('graphics-lost', {}, true);
    expect(trace.report()).toEqual(failed);
    expect(failed.lastStage).toBe('load:world-built');
    expect(failed.failed).toBe(true);
    expect(failed.events.at(-1)?.heapUsedBytes).toBe(1024);
  });

  it('cannot stop loading when heap reading or persistence fails, and rejects invalid counters', () => {
    const save = vi.fn(() => { throw new Error('quota'); });
    const trace = new XboxMemoryTrace({ now: () => 1, heap: () => { throw new Error('unavailable'); }, save });
    expect(() => trace.note('worker-reply:map', { payloadBytes: Infinity, requestId: NaN })).not.toThrow();
    expect(trace.report().events[0]).toMatchObject({ heapUsedBytes: null });
    expect(trace.report().events[0]?.payloadBytes).toBeUndefined();
    expect(trace.report().storageAvailable).toBe(false);
  });

  it('does not expose mutable internal records and caps strings and serialized size', () => {
    const saved: string[] = [];
    const trace = new XboxMemoryTrace({ now: () => 1, save: text => { saved.push(text); } });
    for (let i = 0; i < 500; i++) trace.note('x'.repeat(10000), { map: 'm'.repeat(10000) });
    trace.report().events.length = 0;
    expect(trace.report().events.length).toBeGreaterThan(0);
    expect(saved.every(s => s.length <= 24576)).toBe(true);
    expect(trace.report().events[0]?.stage.length).toBeLessThanOrEqual(64);
  });

  it('counts shared backing buffers once, including slices, Maps and cyclic data', () => {
    const bytes = new ArrayBuffer(4096);
    const tree: Record<string, unknown> = { a: new Uint8Array(bytes, 8, 16), b: new Float32Array(bytes) };
    tree.self = tree;
    tree.map = new Map([['x', new Uint8Array(32)]]);
    expect(bufferPayloadBytes(tree)).toEqual({ bytes: 4128, truncated: false });
  });

  it('bounds payload traversal and never evaluates getters', () => {
    let reads = 0;
    const data = { get secret() { reads++; throw new Error('must not read'); }, huge: Array.from({ length: 1000 }, () => ({})) };
    expect(bufferPayloadBytes(data, 32).truncated).toBe(true);
    expect(reads).toBe(0);
  });

  it('does no payload inspection when disabled and emits only fixed fields when enabled', () => {
    const data = new Proxy({}, { ownKeys() { throw new Error('must not inspect'); } });
    expect(() => noteXboxWorkerReply({ kind: 'map', id: 1, data })).not.toThrow();
    const trace = new XboxMemoryTrace({ now: () => 1 });
    installXboxMemorySink(trace);
    noteXboxWorkerReply({ kind: 'map', id: 2, data: { bytes: new Uint8Array(512), privateText: 'do-not-record' } });
    noteXboxMemory('load:decode-done');
    expect(trace.report().events[0]).toMatchObject({ stage: 'worker-reply:map', requestId: 2, payloadBytes: 512 });
    expect(JSON.stringify(trace.report())).not.toContain('do-not-record');
  });

  it('coalesces repeated worker progress and records a worker failure without its raw message', () => {
    const trace = new XboxMemoryTrace({ now: () => 1 });
    installXboxMemorySink(trace);
    for (let i = 0; i < 100; i++) noteXboxWorkerReply({ kind: 'progress', id: 2, stage: 'geometry', done: i });
    noteXboxWorkerReply({ kind: 'error', id: 2, message: 'private path' });
    expect(trace.report().events).toHaveLength(2);
    expect(trace.report().failed).toBe(true);
    expect(JSON.stringify(trace.report())).not.toContain('private path');
  });

  it('keeps backend and map after ring rollover, resets them for the next match, and retains the heap peak', () => {
    let usedJSHeapSize = 2048;
    const trace = new XboxMemoryTrace({ now: () => 1, heap: () => ({ usedJSHeapSize }) });
    trace.note('match-load', { map: 'MP2' });
    trace.note('renderer-ready', { backend: 'webgl2' });
    usedJSHeapSize = 1024;
    for (let i = 0; i < 100; i++) trace.note('sample');
    expect(trace.report()).toMatchObject({ current: { backend: 'webgl2', map: 'MP2' }, peakHeapUsedBytes: 2048 });
    trace.note('match-load', { map: 'MP51' });
    expect(trace.report().current).toEqual({ map: 'MP51' });
  });

  it('does not inspect later replies after a failure freezes the report', () => {
    const trace = new XboxMemoryTrace({ now: () => 1 });
    installXboxMemorySink(trace);
    noteXboxMemory('worker-error', {}, true);
    const inspect = vi.fn(() => []);
    noteXboxWorkerReply({ kind: 'map', id: 2, data: new Proxy({}, { ownKeys: inspect }) });
    expect(inspect).not.toHaveBeenCalled();
  });

  it('trims escaped records to the storage limit while retaining the latest checkpoint', () => {
    const save = vi.fn();
    const trace = new XboxMemoryTrace({ now: () => Number.MAX_SAFE_INTEGER, save,
      heap: () => ({ usedJSHeapSize: Number.MAX_SAFE_INTEGER, totalJSHeapSize: Number.MAX_SAFE_INTEGER, jsHeapSizeLimit: Number.MAX_SAFE_INTEGER }) });
    for (let i = 0; i < 100; i++) trace.note('\u0000'.repeat(64), { map: '\u0000'.repeat(32), payloadBytes: Number.MAX_SAFE_INTEGER,
      requestId: Number.MAX_SAFE_INTEGER, width: Number.MAX_SAFE_INTEGER, height: Number.MAX_SAFE_INTEGER, backend: 'webgl2', payloadTruncated: true });
    trace.note('graphics-lost', {}, true);
    expect(save).toHaveBeenCalledTimes(101);
    expect(save.mock.calls.every(([text]) => text.length <= 24576)).toBe(true);
    expect(JSON.parse(save.mock.calls.at(-1)![0])).toMatchObject({ failed: true, historyTruncated: true, storageAvailable: true });
  });
});
