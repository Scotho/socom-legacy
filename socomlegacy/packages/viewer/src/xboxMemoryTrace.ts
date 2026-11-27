/**
 * Browser adaptation: a bounded, opt-in loading record for Xbox context-loss investigation.
 * Heap figures and reply backing-buffer bytes are partial measurements, NOT browser RAM or free VRAM.
 * No assets, paths, error messages or accounts are retained. The normal page has no installed sink.
 */
export const XBOX_TRACE_EVENTS_ADAPTATION = 48;
export const XBOX_TRACE_STORAGE_CHARS_ADAPTATION = 24_576;
export const XBOX_TRACE_VISITS_ADAPTATION = 8192;

export interface MemoryFields {
  requestId?: number; payloadBytes?: number; payloadTruncated?: boolean;
  backend?: 'webgl2' | 'webgpu'; width?: number; height?: number; map?: string;
  worldPresent?: boolean;
  graphicsCause?: 'out-of-memory' | 'validation' | 'internal' | 'unknown';
}
export interface MemoryEvent extends MemoryFields {
  atMs: number; stage: string;
  heapUsedBytes: number | null; heapTotalBytes: number | null; heapLimitBytes: number | null;
}
export interface MemoryReport {
  v: 1; failed: boolean; lastStage: string; storageAvailable: boolean;
  historyTruncated: boolean;
  current: MemoryFields; peakHeapUsedBytes: number | null;
  events: MemoryEvent[];
}
export interface MemoryTraceOptions {
  now(): number;
  heap?(): { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number } | undefined;
  save?(text: string, failed: boolean): void;
}
const count = (n: unknown): number | undefined => typeof n === 'number' && Number.isFinite(n) && n >= 0
  ? Math.min(Number.MAX_SAFE_INTEGER, Math.round(n)) : undefined;

export class XboxMemoryTrace {
  private readonly events: MemoryEvent[] = [];
  private failed = false;
  private lastStage = 'boot';
  private storageAvailable = true;
  private historyTruncated = false;
  private current: MemoryFields = {};
  private peakHeapUsedBytes: number | null = null;
  constructor(private readonly o: MemoryTraceOptions) {}
  get frozen(): boolean { return this.failed; }
  report(): MemoryReport {
    return { v: 1, failed: this.failed, lastStage: this.lastStage, storageAvailable: this.storageAvailable,
      historyTruncated: this.historyTruncated,
      current: { ...this.current }, peakHeapUsedBytes: this.peakHeapUsedBytes,
      events: this.events.map(e => ({ ...e })) };
  }
  note(stage: string, fields: MemoryFields = {}, failure = false): void {
    if (this.failed) return;
    try {
      const name = stage.slice(0, 64);
      const last = this.events.at(-1);
      if (name.startsWith('worker-progress:') && last?.stage === name && last.requestId === fields.requestId) return;
      let heap: ReturnType<NonNullable<MemoryTraceOptions['heap']>>;
      try { heap = this.o.heap?.(); } catch { heap = undefined; }
      const event: MemoryEvent = { atMs: count(this.o.now()) ?? 0, stage: name,
        heapUsedBytes: count(heap?.usedJSHeapSize) ?? null, heapTotalBytes: count(heap?.totalJSHeapSize) ?? null,
        heapLimitBytes: count(heap?.jsHeapSizeLimit) ?? null };
      for (const key of ['requestId', 'payloadBytes', 'width', 'height'] as const) {
        const value = count(fields[key]);
        if (value !== undefined) event[key] = value;
      }
      if (fields.payloadTruncated !== undefined) event.payloadTruncated = fields.payloadTruncated === true;
      if (fields.backend === 'webgl2' || fields.backend === 'webgpu') event.backend = fields.backend;
      if (typeof fields.map === 'string') event.map = fields.map.slice(0, 32);
      if (fields.worldPresent !== undefined) event.worldPresent = fields.worldPresent === true;
      if (fields.graphicsCause && ['out-of-memory', 'validation', 'internal', 'unknown'].includes(fields.graphicsCause)) event.graphicsCause = fields.graphicsCause;
      if (name === 'match-load') this.current = {};
      for (const key of ['backend', 'width', 'height', 'map', 'worldPresent', 'graphicsCause'] as const) {
        if (event[key] !== undefined) Object.assign(this.current, { [key]: event[key] });
      }
      if (event.heapUsedBytes !== null) this.peakHeapUsedBytes = Math.max(this.peakHeapUsedBytes ?? 0, event.heapUsedBytes);
      if (!failure && name !== 'sample') this.lastStage = name;
      this.events.push(event);
      if (this.events.length > XBOX_TRACE_EVENTS_ADAPTATION) { this.events.shift(); this.historyTruncated = true; }
      this.failed = failure;
      let text = JSON.stringify(this.report());
      while (text.length > XBOX_TRACE_STORAGE_CHARS_ADAPTATION && this.events.length > 1) {
        this.events.shift(); this.historyTruncated = true; text = JSON.stringify(this.report());
      }
      if (text.length <= XBOX_TRACE_STORAGE_CHARS_ADAPTATION && this.storageAvailable) {
        try { this.o.save?.(text, failure); } catch { this.storageAvailable = false; }
      }
    } catch { /* Diagnostic work must never interrupt loading or error handling. */ }
  }
}

/** Count unique backing buffers in a reply, without retaining it. A capped walk reports a lower bound. */
export function bufferPayloadBytes(value: unknown, limit = XBOX_TRACE_VISITS_ADAPTATION): { bytes: number; truncated: boolean } {
  const cap = Math.max(1, Math.min(XBOX_TRACE_VISITS_ADAPTATION, count(limit) ?? XBOX_TRACE_VISITS_ADAPTATION));
  const todo: unknown[] = [value];
  const seen = new Set<object>(), buffers = new Set<ArrayBufferLike>();
  let bytes = 0, visits = 0, edges = 0, truncated = false;
  const add = (v: unknown): boolean => {
    if (++edges > cap) { truncated = true; return false; }
    if (typeof v === 'object' && v !== null) todo.push(v);
    return true;
  };
  while (todo.length && visits++ < cap) {
    const item = todo.pop();
    if (typeof item !== 'object' || item === null || seen.has(item)) continue;
    seen.add(item);
    try {
      const buffer = ArrayBuffer.isView(item) ? item.buffer : item instanceof ArrayBuffer ? item : null;
      if (buffer) {
        if (!buffers.has(buffer)) { buffers.add(buffer); bytes += buffer.byteLength; }
      } else if (item instanceof Map) {
        for (const [k, v] of item) { if (!add(k) || !add(v)) break; }
      } else if (item instanceof Set) {
        for (const v of item) if (!add(v)) break;
      } else {
        for (const key in item) {
          if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
          // A getter could execute application code or expose a private value. Structured-clone replies need none.
          const descriptor = Object.getOwnPropertyDescriptor(item, key);
          if (!add(descriptor && 'value' in descriptor ? descriptor.value : null)) break;
        }
      }
    } catch { truncated = true; }
  }
  return { bytes, truncated: truncated || todo.length > 0 };
}

let sink: XboxMemoryTrace | null = null;
export function installXboxMemorySink(next: XboxMemoryTrace | null): void { sink = next; }
export function noteXboxMemory(stage: string, fields?: MemoryFields, failed = false): void { sink?.note(stage, fields, failed); }
export function noteXboxWorkerReply(reply: { kind: string; id: number; stage?: string; [key: string]: unknown }): void {
  if (!sink || sink.frozen) return;
  try {
    if (reply.kind === 'progress') {
      sink.note(`worker-progress:${reply.stage ?? 'unknown'}`, { requestId: reply.id });
    } else if (reply.kind === 'error') {
      sink.note('worker-error', { requestId: reply.id }, true);
    } else {
      const payload = bufferPayloadBytes(reply);
      sink.note(`worker-reply:${reply.kind}`, { requestId: reply.id, payloadBytes: payload.bytes, payloadTruncated: payload.truncated });
    }
  } catch { /* Ignore unavailable counters. */ }
}
