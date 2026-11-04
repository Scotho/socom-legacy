import { createHash } from 'node:crypto';
import type { DiscIdentity } from '@s2u/archive';
import type { DiscExtractRecord } from '../src/discExtract';
import type { ExtractBackend } from '../src/discExtractStore';
import type { ReceiveStore, SendSource, SharePipe } from '../src/discShareProtocol';
import type { StreamedFile } from '../src/discStreamWrite';

/**
 * DSH-4's test doubles (jsdom has no RTCPeerConnection; the stores are the extraction's, faked): a pair of connected
 * pipes with a `bufferedAmount` the test can hold, a sender's kept extraction over synthetic bytes (never disc data),
 * and a receiver's store that keeps whole blocks across a drop as DSH-2's streamed write does.
 */

export const IDENTITY: DiscIdentity = { boot: 'SCUS_973.24', ver: '1.00', vmode: 'NTSC' } as DiscIdentity;
export const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

/** Synthetic file bytes: a seeded pattern, `size` long. */
export function bytesOf(seed: number, size: number): Uint8Array {
  const b = new Uint8Array(size);
  let x = seed * 2654435761 >>> 0;
  for (let i = 0; i < size; i++) { x = (x * 1103515245 + 12345) >>> 0; b[i] = x >>> 24; }
  return b;
}

/**
 * The synthetic set's own check (`ReceiveOptions.isReadSet`, the test seam): these fakes' paths (`RUN/F<i>.BIN`) are not
 * the read set (`@s2u/archive` `readSetPaths`), so a test of the transfer itself passes this in its place.
 */
export const syntheticSet = (paths: readonly string[]): boolean => paths.length > 0 && paths.every((p) => /^RUN\/F\d+\.BIN$/.test(p));

export interface FakeFile { path: string; data: Uint8Array }
export function files(...sizes: number[]): FakeFile[] {
  return sizes.map((n, i) => ({ path: `RUN/F${i}.BIN`, data: bytesOf(i + 1, n) }));
}

/** The sender's kept extraction over `fs` (its record whole), its range reads logged. */
export function source(fs: FakeFile[], readSet = 3): SendSource & { reads: { path: string; offset: number; length: number }[] } {
  const reads: { path: string; offset: number; length: number }[] = [];
  const record: DiscExtractRecord = {
    v: 1, readSet, identity: IDENTITY, backend: 'opfs', dir: 'SCUS_97324', total: fs.reduce((n, f) => n + f.data.length, 0),
    files: fs.map((f) => ({ path: f.path, size: f.data.length, sha256: sha(f.data), done: true })), persisted: true, started: 1, when: 2,
  };
  return {
    record, reads,
    async readRange(path, offset, length) {
      reads.push({ path, offset, length });
      const f = fs.find((x) => x.path === path);
      if (!f || offset + length > f.data.length) throw new Error(`no ${path} at ${offset}+${length}`);
      return f.data.slice(offset, offset + length);
    },
  };
}

/** A receiver's store: whole blocks kept across a drop (`abort`), the record committed once. */
export function store(block = 32 * 1024): ReceiveStore & {
  stored: Map<string, Uint8Array>; commits: DiscExtractRecord[]; discarded: string[]; prepared: number; corrupt: Set<string>;
} {
  const stored = new Map<string, Uint8Array>();
  const commits: DiscExtractRecord[] = [];
  const discarded: string[] = [];
  const corrupt = new Set<string>();
  const s = {
    stored, commits, discarded, corrupt, prepared: 0,
    async prepare() { s.prepared++; },
    async open(_identity: DiscIdentity, path: string, size: number): Promise<StreamedFile> {
      const had = stored.get(path) ?? new Uint8Array(0);
      const start = had.length >= size ? size : Math.floor(had.length / block) * block;
      let held = had.slice(0, start);
      let pending: number[] = [];
      const flush = (all: boolean): void => {
        const keep = all ? pending.length : Math.floor((held.length + pending.length) / block) * block - held.length;
        if (keep <= 0) return;
        const next = new Uint8Array(held.length + keep);
        next.set(held); next.set(pending.slice(0, keep), held.length);
        held = next; pending = pending.slice(keep);
        stored.set(path, held);
      };
      stored.set(path, held);
      return {
        backend: 'opfs' as ExtractBackend,
        storedBytes: start,
        async write(chunk) { for (const b of chunk) pending.push(b); flush(false); },
        async finish() {
          flush(true);
          if (held.length !== size) throw new Error(`${path}: ${held.length} of ${size}`);
          const out = corrupt.has(path) ? held.map((b, i) => (i === 0 ? b ^ 1 : b)) : held;
          return { bytes: held.length, sha256: sha(out) };
        },
        async abort() { pending = []; },
      };
    },
    async discard(_identity: DiscIdentity, path: string) { discarded.push(path); stored.delete(path); },
    async commit(r: Omit<DiscExtractRecord, 'v' | 'dir' | 'persisted' | 'started' | 'when'>): Promise<DiscExtractRecord> {
      const rec: DiscExtractRecord = { ...r, v: 1, dir: 'SCUS_97324', persisted: true, started: 1, when: 2 };
      commits.push(rec);
      return rec;
    },
  };
  return s;
}

/**
 * Two connected pipes. Auto: each message is delivered on the next macrotask and the buffer empties as it goes, and
 * `close()` delivers what is queued before it closes (an `RTCDataChannel`'s close, `./discShareRtc` `channelPipe`). Held
 * (`hold: true`): sends pile up in `bufferedAmount` until the test calls `flush()`, which delivers them and fires drained;
 * `close()` drops them (a stalled channel). `drop()` is a connection lost: what is queued is lost.
 */
export function pipes(opts: { hold?: boolean; high?: number } = {}) {
  const high = opts.high ?? 256 * 1024;
  type End = SharePipe & { sent: (string | Uint8Array)[]; maxBufferedAtSend: number; bufferedAmount: number; flush(): void; drop(): void };
  const make = (): End => {
    let msgFn: ((d: string | ArrayBuffer) => void) | null = null;
    const early: (string | ArrayBuffer)[] = [];
    const closeFns: (() => void)[] = [];
    let drainFns: (() => void)[] = [];
    let queue: (string | ArrayBuffer)[] = [];
    const e: End = {
      sent: [], maxBufferedAtSend: 0, bufferedAmount: 0, high,
      send(d) {
        if (closed) throw new Error('closed');
        e.maxBufferedAtSend = Math.max(e.maxBufferedAtSend, e.bufferedAmount);
        e.sent.push(d);
        const wire = typeof d === 'string' ? d : d.slice().buffer as ArrayBuffer;
        e.bufferedAmount += typeof d === 'string' ? d.length : d.byteLength;
        queue.push(wire);
        if (!opts.hold) setTimeout(() => { e.flush(); }, 0);
      },
      buffered: () => e.bufferedAmount,
      drained: () => new Promise<void>((r) => { if (closed || e.bufferedAmount <= high / 4) r(); else drainFns.push(r); }),
      onMessage(fn) { msgFn = fn; for (const d of early.splice(0)) fn(d); },
      onClose(fn) { if (closed) fn(); else closeFns.push(fn); },
      close() { if (!opts.hold) e.flush(); e.drop(); },     // a channel's close sends what is queued first; a held (stalled) one cannot
      flush() {
        const q = queue; queue = [];
        for (const d of q) other().receive(d);
        e.bufferedAmount = 0;
        const w = drainFns; drainFns = []; for (const f of w) f();
      },
      drop() {
        if (closed) return;
        closed = true; queue = [];
        for (const f of closeFns.splice(0)) f();
        const w = drainFns; drainFns = []; for (const f of w) f();
        other().drop();
      },
    } as End;
    let closed = false;
    (e as unknown as { receive(d: string | ArrayBuffer): void }).receive = (d) => { if (closed) return; if (msgFn) msgFn(d); else early.push(d); };
    let other = (): End & { receive(d: string | ArrayBuffer): void } => e as never;
    (e as unknown as { link(o: End): void }).link = (o) => { other = () => o as never; };
    return e;
  };
  const a = make();
  const b = make();
  (a as unknown as { link(o: End): void }).link(b);
  (b as unknown as { link(o: End): void }).link(a);
  return { a, b };
}
