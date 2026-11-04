import { connect as netConnect, type Socket } from 'node:net';

/**
 * The PINE client of the emulator parity harness (EPH-2; docs/specs/2026-10-30-emulator-parity-harness-design.md:
 * PINE has no pad operation, so it is the clock and the probe, not the input). Product track (OT.R53): a validation
 * instrument, an adaptation, never in a build and never changing the game's behaviour.
 *
 * Ported from desktop@be5578311:tools_py/parity/pine.py (read only, never run from here):
 * - :1-4 the wire: a request is u32 total_len, u8 opcode, args; a reply is u32 total_len, u8 result (0 ok), data;
 *   all little-endian; total_len counts itself;
 * - :8-10 the opcodes; :69-73 save_state 0x9 and load_state 0xa, a u8 slot;
 * - :29-35 _call (a non-zero result fails the call); :37-53 read8/16/32/64, write8/32;
 * - :55-58 _string (a u32 length prefix, trailing NULs stripped); :60-67 version, title, status.
 * Not ported: cstring and the batched read64 / read_block (pine.py:75-113), which the harness does not need yet.
 * The default port is pine.py's 28011 (PCSX2's PINESlot).
 *
 * The timeout: pine.py:14-15 opens the socket with `create_connection(..., timeout=5)`, a socket timeout that binds the
 * connect and every later send and recv, so a call PCSX2 never answers fails after 5 s. Here each call has the same
 * timer. The wire is in order, one reply per request, so a call that timed out keeps its place in the queue and its
 * late reply, if it comes, is dropped -- the next call still gets its own reply.
 */

export const DEFAULT_PINE_PORT = 28011;

export const OP = {
  READ8: 0, READ16: 1, READ32: 2, READ64: 3, WRITE8: 4, WRITE16: 5, WRITE32: 6, WRITE64: 7,
  VERSION: 8, SAVE_STATE: 9, LOAD_STATE: 0xa, TITLE: 0xb, STATUS: 0xf,
} as const;

/** struct.pack("<IB", 5 + len(payload), op) + payload. */
export function encodeRequest(op: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  const out = new Uint8Array(5 + payload.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, out.length, true);
  out[4] = op;
  out.set(payload, 5);
  return out;
}

const u32 = (a: number): Uint8Array => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, a >>> 0, true);
  return b;
};
const cat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/** The request bytes of each call, as pine.py packs them. */
export const pineRequest = {
  read8: (a: number) => encodeRequest(OP.READ8, u32(a)),
  read16: (a: number) => encodeRequest(OP.READ16, u32(a)),
  read32: (a: number) => encodeRequest(OP.READ32, u32(a)),
  read64: (a: number) => encodeRequest(OP.READ64, u32(a)),
  write8: (a: number, v: number) => encodeRequest(OP.WRITE8, cat(u32(a), Uint8Array.of(v & 0xff))),
  write32: (a: number, v: number) => encodeRequest(OP.WRITE32, cat(u32(a), u32(v))),
  version: () => encodeRequest(OP.VERSION),
  title: () => encodeRequest(OP.TITLE),
  status: () => encodeRequest(OP.STATUS),
  saveState: (slot: number) => encodeRequest(OP.SAVE_STATE, Uint8Array.of(slot & 0xff)),
  loadState: (slot: number) => encodeRequest(OP.LOAD_STATE, Uint8Array.of(slot & 0xff)),
};

export interface PineReply {
  readonly result: number;
  readonly data: Uint8Array;
}

/** Cuts a byte stream into replies: u32 total_len (counting itself), u8 result, total_len - 5 bytes of data. */
export class ReplyReader {
  private buf: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): PineReply[] {
    this.buf = cat(this.buf, chunk);
    const out: PineReply[] = [];
    for (;;) {
      if (this.buf.length < 5) break;
      const total = new DataView(this.buf.buffer, this.buf.byteOffset, 4).getUint32(0, true);
      if (total < 5) throw new Error(`PINE: a reply of length ${total}, under its own 5-byte header`);
      if (this.buf.length < total) break;
      out.push({ result: this.buf[4]!, data: this.buf.slice(5, total) });
      this.buf = this.buf.slice(total);
    }
    return out;
  }
}

/** pine.py _string: a u32 length prefix, then the text with its trailing NULs stripped. */
export function decodeString(data: Uint8Array): string {
  if (data.length < 4) return '';
  let end = data.length;
  while (end > 4 && data[end - 1] === 0) end--;
  return new TextDecoder('utf-8').decode(data.subarray(4, end));
}

export interface PineSocketPathOptions {
  /** A socket path named outright: used on any platform. */
  readonly path?: string;
  readonly platform?: NodeJS.Platform;
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Whether a path exists (default: not checked). */
  readonly exists?: (path: string) => boolean;
}

/**
 * Where PCSX2's PINE listens, as a socket path, or null for TCP (Windows). PCSX2 v2.8.2 off Windows serves PINE on a
 * Unix socket, `$XDG_RUNTIME_DIR/pcsx2.sock`, else `/tmp/pcsx2.sock` (pcsx2/PINE.cpp:300-313 at the v2.8.2 tag, as
 * agent-mail/evidence/hd-gsdump-plan/RECIPE.md section 1 reads it; the default slot -- another slot appends
 * `.<slot>` there, which the harness does not use). With `exists`, an absent XDG socket beside a present /tmp one gives
 * the /tmp one. An adaptation for the Linux seat box; the wire is the same.
 */
export function pineSocketPath(o: PineSocketPathOptions = {}): string | null {
  if (o.path) return o.path;
  if ((o.platform ?? process.platform) === 'win32') return null;
  const env = o.env ?? process.env;
  const tmp = '/tmp/pcsx2.sock';
  const dir = env.XDG_RUNTIME_DIR;
  if (!dir) return tmp;
  const xdg = `${dir.replace(/\/+$/, '')}/pcsx2.sock`;
  if (o.exists && !o.exists(xdg) && o.exists(tmp)) return tmp;
  return xdg;
}

export interface PineConnectOptions {
  readonly port?: number;
  readonly host?: string;
  /** A socket path (a Unix socket, or a Windows named pipe): net.connect({ path }) instead of TCP; see pineSocketPath. */
  readonly path?: string | null;
  /** pine.py's socket timeout, 5 s (pine.py:14-15), applied to the connect and to each call. */
  readonly timeoutMs?: number;
}

export const DEFAULT_PINE_TIMEOUT_MS = 5000;

interface Pending {
  readonly op: number;
  readonly resolve: (data: Uint8Array) => void;
  readonly reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  /** Timed out: its reply, if it ever comes, is dropped. */
  dead: boolean;
}

/** One PINE connection; calls are answered in the order they were sent, one reply per request. */
export class PineClient {
  private readonly reader = new ReplyReader();
  private readonly pending: Pending[] = [];
  private closedWith: Error | null = null;

  private constructor(private readonly sock: Socket, private readonly timeoutMs: number) {
    sock.on('data', (d: Buffer) => {
      let replies: PineReply[];
      try {
        replies = this.reader.push(d);
      } catch (err) {
        this.fail(err as Error);
        return;
      }
      for (const r of replies) {
        const p = this.pending.shift();
        if (!p) { this.fail(new Error('PINE: a reply nobody asked for')); return; }
        if (p.dead) continue;
        if (p.timer) clearTimeout(p.timer);
        if (r.result !== 0) p.reject(new Error(`PINE op 0x${p.op.toString(16)} failed`));
        else p.resolve(r.data);
      }
    });
    sock.on('error', (err) => this.fail(new Error(`PINE closed: ${err.message}`)));
    sock.on('close', () => this.fail(new Error('PINE closed')));
  }

  static connect(opts: PineConnectOptions = {}): Promise<PineClient> {
    const port = opts.port ?? DEFAULT_PINE_PORT;
    const host = opts.host ?? '127.0.0.1';
    const timeoutMs = opts.timeoutMs ?? DEFAULT_PINE_TIMEOUT_MS;
    const path = opts.path ?? null;
    const where = path ?? `${host}:${port}`;
    return new Promise((resolve, reject) => {
      const sock = path ? netConnect({ path }) : netConnect({ port, host });
      const timer = setTimeout(() => { sock.destroy(); reject(new Error(`PINE: cannot connect to ${where} (timed out after ${timeoutMs} ms)`)); }, timeoutMs);
      sock.once('error', (err) => { clearTimeout(timer); reject(new Error(`PINE: cannot connect to ${where} (${err.message})`)); });
      sock.once('connect', () => {
        clearTimeout(timer);
        sock.removeAllListeners('error');
        sock.setNoDelay(true);
        resolve(new PineClient(sock, timeoutMs));
      });
    });
  }

  close(): void {
    this.sock.destroy();
    this.fail(new Error('PINE closed'));
  }

  private fail(err: Error): void {
    this.closedWith ??= err;
    for (const p of this.pending.splice(0)) {
      if (p.timer) clearTimeout(p.timer);
      if (!p.dead) p.reject(err);
    }
  }

  private call(req: Uint8Array, want?: number): Promise<Uint8Array> {
    const op = req[4]!;
    if (this.closedWith) return Promise.reject(this.closedWith);
    return new Promise<Uint8Array>((resolve, reject) => {
      const entry: Pending = {
        op,
        resolve: (data) => {
          if (want !== undefined && data.length < want) {
            reject(new Error(`PINE op 0x${op.toString(16)} returned ${data.length} bytes, expected ${want}`));
          } else resolve(data);
        },
        reject,
        timer: null,
        dead: false,
      };
      entry.timer = setTimeout(() => {
        entry.dead = true;
        entry.timer = null;
        reject(new Error(`PINE op 0x${op.toString(16)} timed out after ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      this.pending.push(entry);
      this.sock.write(req);
    });
  }

  private static view(d: Uint8Array): DataView {
    return new DataView(d.buffer, d.byteOffset, d.byteLength);
  }

  async read8(a: number): Promise<number> { return (await this.call(pineRequest.read8(a), 1))[0]!; }
  async read16(a: number): Promise<number> { return PineClient.view(await this.call(pineRequest.read16(a), 2)).getUint16(0, true); }
  async read32(a: number): Promise<number> { return PineClient.view(await this.call(pineRequest.read32(a), 4)).getUint32(0, true); }
  async read64(a: number): Promise<bigint> { return PineClient.view(await this.call(pineRequest.read64(a), 8)).getBigUint64(0, true); }
  async write8(a: number, v: number): Promise<void> { await this.call(pineRequest.write8(a, v)); }
  async write32(a: number, v: number): Promise<void> { await this.call(pineRequest.write32(a, v)); }
  async version(): Promise<string> { return decodeString(await this.call(pineRequest.version())); }
  async title(): Promise<string> { return decodeString(await this.call(pineRequest.title())); }
  async status(): Promise<number> { return PineClient.view(await this.call(pineRequest.status(), 4)).getUint32(0, true); }
  async saveState(slot: number): Promise<void> { await this.call(pineRequest.saveState(slot)); }
  async loadState(slot: number): Promise<void> { await this.call(pineRequest.loadState(slot)); }
}
