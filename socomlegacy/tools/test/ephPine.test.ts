import { tmpdir } from 'node:os';
import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PINE_PORT, OP, PineClient, ReplyReader, decodeString, encodeRequest, pineRequest, pineSocketPath,
} from '../eph/pine';

/**
 * The PINE client (EPH-2), ported from desktop@be5578311:tools_py/parity/pine.py: a request is u32 total_len, u8
 * opcode, args; a reply is u32 total_len, u8 result (0 ok), data -- all little-endian. The byte arrays below are what
 * pine.py's struct.pack calls give for the same arguments.
 */
const bytes = (u: Uint8Array): number[] => [...u];

describe('the PINE framing', () => {
  it('carries the opcodes of pine.py', () => {
    expect(OP).toEqual({
      READ8: 0, READ16: 1, READ32: 2, READ64: 3, WRITE8: 4, WRITE16: 5, WRITE32: 6, WRITE64: 7,
      VERSION: 8, SAVE_STATE: 9, LOAD_STATE: 0xa, TITLE: 0xb, STATUS: 0xf,
    });
    expect(DEFAULT_PINE_PORT).toBe(28011);
  });

  it('encodes as struct.pack("<IB", 5 + len(payload), op) + payload', () => {
    expect(bytes(encodeRequest(OP.VERSION))).toEqual([5, 0, 0, 0, 8]);
    expect(bytes(pineRequest.read8(0x00123456))).toEqual([9, 0, 0, 0, 0, 0x56, 0x34, 0x12, 0x00]);
    expect(bytes(pineRequest.read16(0x2000))).toEqual([9, 0, 0, 0, 1, 0x00, 0x20, 0, 0]);
    expect(bytes(pineRequest.read32(0xffffffff))).toEqual([9, 0, 0, 0, 2, 0xff, 0xff, 0xff, 0xff]);
    expect(bytes(pineRequest.read64(0x10))).toEqual([9, 0, 0, 0, 3, 0x10, 0, 0, 0]);
    expect(bytes(pineRequest.write8(0x10, 0x1ff))).toEqual([10, 0, 0, 0, 4, 0x10, 0, 0, 0, 0xff]);
    expect(bytes(pineRequest.write32(0x10, 0x01020304))).toEqual([13, 0, 0, 0, 6, 0x10, 0, 0, 0, 4, 3, 2, 1]);
    expect(bytes(pineRequest.status())).toEqual([5, 0, 0, 0, 0xf]);
    expect(bytes(pineRequest.title())).toEqual([5, 0, 0, 0, 0xb]);
    expect(bytes(pineRequest.saveState(3))).toEqual([6, 0, 0, 0, 9, 3]);
    expect(bytes(pineRequest.loadState(8))).toEqual([6, 0, 0, 0, 0xa, 8]);
  });

  it('reads replies split across chunks and several in one chunk', () => {
    const r = new ReplyReader();
    expect(r.push(Uint8Array.from([9, 0]))).toEqual([]);
    expect(r.push(Uint8Array.from([0, 0, 0, 0xaa, 0xbb]))).toEqual([]);
    const got = r.push(Uint8Array.from([0xcc, 0xdd, 5, 0, 0, 0, 0xff]));
    expect(got.map((g) => [g.result, bytes(g.data)])).toEqual([[0, [0xaa, 0xbb, 0xcc, 0xdd]], [0xff, []]]);
  });

  it('decodes a string reply as pine.py _string: a u32 length prefix, trailing NULs stripped', () => {
    expect(decodeString(Uint8Array.from([6, 0, 0, 0, 0x76, 0x31, 0x2e, 0x37, 0, 0]))).toBe('v1.7');
    expect(decodeString(Uint8Array.from([1, 0]))).toBe('');
  });
});

describe('the PINE client against a local fake server', () => {
  let server: Server | undefined;
  afterEach(async () => {
    await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
    server = undefined;
  });

  const fake = async (answer: (op: number, args: Buffer) => Buffer | null): Promise<{ port: number; seen: number[][] }> => {
    const seen: number[][] = [];
    server = createServer((sock: Socket) => {
      let buf = Buffer.alloc(0);
      sock.on('data', (d: Buffer) => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 4 && buf.length >= buf.readUInt32LE(0)) {
          const n = buf.readUInt32LE(0);
          const msg = buf.subarray(0, n);
          buf = buf.subarray(n);
          seen.push([...msg]);
          const data = answer(msg[4]!, msg.subarray(5));
          const head = Buffer.alloc(5);
          head.writeUInt32LE(5 + (data?.length ?? 0), 0);
          head[4] = data === null ? 0xff : 0;
          sock.write(Buffer.concat([head, data ?? Buffer.alloc(0)]));
        }
      });
    });
    await new Promise<void>((done) => server!.listen(0, '127.0.0.1', () => done()));
    return { port: (server!.address() as AddressInfo).port, seen };
  };

  it('reads 8, 16, 32 and 64 bits, the version, the status, and saves and loads a state', async () => {
    const { port, seen } = await fake((op, args) => {
      if (op === OP.READ8) return Buffer.from([0x7f]);
      if (op === OP.READ16) return Buffer.from([0x34, 0x12]);
      if (op === OP.READ32) return Buffer.from([0x78, 0x56, 0x34, 0x12]);
      if (op === OP.READ64) return Buffer.from([1, 0, 0, 0, 0, 0, 0, 0x80]);
      if (op === OP.VERSION) return Buffer.from([10, 0, 0, 0, ...Buffer.from('PCSX2 2.0'), 0]);
      if (op === OP.STATUS) return Buffer.from([1, 0, 0, 0]);
      if (op === OP.SAVE_STATE || op === OP.LOAD_STATE) return args[0] === 9 ? null : Buffer.alloc(0);
      return null;
    });
    const pine = await PineClient.connect({ port });
    try {
      const [a, b, c, d] = await Promise.all([pine.read8(1), pine.read16(2), pine.read32(3), pine.read64(4)]);
      expect([a, b, c, d]).toEqual([0x7f, 0x1234, 0x12345678, 0x8000000000000001n]);
      expect(await pine.version()).toBe('PCSX2 2.0');
      expect(await pine.status()).toBe(1);
      await pine.saveState(2);
      await pine.loadState(2);
      await expect(pine.loadState(9)).rejects.toThrow(/PINE op 0xa failed/);
      expect(seen.slice(0, 4)).toEqual([
        [9, 0, 0, 0, 0, 1, 0, 0, 0], [9, 0, 0, 0, 1, 2, 0, 0, 0], [9, 0, 0, 0, 2, 3, 0, 0, 0], [9, 0, 0, 0, 3, 4, 0, 0, 0],
      ]);
      expect(seen.slice(6, 8)).toEqual([[6, 0, 0, 0, 9, 2], [6, 0, 0, 0, 0xa, 2]]);
    } finally {
      pine.close();
    }
  });

  it('refuses a short data reply and fails pending calls when the socket closes', async () => {
    const { port } = await fake((op) => (op === OP.READ32 ? Buffer.from([1]) : null));
    const pine = await PineClient.connect({ port });
    try {
      await expect(pine.read32(0)).rejects.toThrow(/PINE op 0x2 returned 1 bytes, expected 4/);
    } finally {
      pine.close();
    }
    await expect(pine.read8(0)).rejects.toThrow(/PINE closed/);
  });

  it('fails to connect with a clear line when nothing listens', async () => {
    const { port } = await fake(() => null);
    await new Promise<void>((done) => server!.close(() => done()));
    server = undefined;
    await expect(PineClient.connect({ port, timeoutMs: 2000 })).rejects.toThrow(new RegExp(`PINE: cannot connect to 127.0.0.1:${port}`));
  });
});

describe('the PINE call timeout (pine.py:14-15: the socket timeout binds every call, not only the connect)', () => {
  let server: Server | undefined;
  afterEach(async () => {
    await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
    server = undefined;
  });

  /** A server that reads every request and answers only those `answer` gives bytes for, each after `delayMs`. */
  const quiet = async (answer: (n: number) => { data: number[]; delayMs: number } | null): Promise<number> => {
    const socks: Socket[] = [];
    server = createServer((sock: Socket) => {
      socks.push(sock);
      let n = 0;
      let buf = Buffer.alloc(0);
      sock.on('data', (d: Buffer) => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 4 && buf.length >= buf.readUInt32LE(0)) {
          buf = buf.subarray(buf.readUInt32LE(0));
          const a = answer(n++);
          if (!a) continue;
          const head = Buffer.alloc(5);
          head.writeUInt32LE(5 + a.data.length, 0);
          setTimeout(() => sock.write(Buffer.concat([head, Buffer.from(a.data)])), a.delayMs);
        }
      });
    });
    server.on('close', () => socks.forEach((s) => s.destroy()));
    await new Promise<void>((done) => server!.listen(0, '127.0.0.1', () => done()));
    return (server!.address() as AddressInfo).port;
  };

  it('fails a call the server never answers after the timeout, with a clear line', async () => {
    const port = await quiet(() => null);
    const pine = await PineClient.connect({ port, timeoutMs: 100 });
    try {
      const t0 = Date.now();
      await expect(pine.read32(0x10)).rejects.toThrow(/PINE op 0x2 timed out after 100 ms/);
      expect(Date.now() - t0).toBeLessThan(2000);
    } finally {
      pine.close();
    }
  });

  it('keeps the replies in order after a timed-out call: its late reply is dropped, the next call gets its own', async () => {
    // Request 0 is answered late (after its timeout), request 1 at once: request 1 must not take request 0 late bytes.
    const port = await quiet((n) => (n === 0 ? { data: [1, 0, 0, 0], delayMs: 400 } : { data: [2, 0, 0, 0], delayMs: 200 }));
    const pine = await PineClient.connect({ port, timeoutMs: 300 });
    try {
      await expect(pine.read32(0)).rejects.toThrow(/timed out/);
      expect(await pine.read32(0)).toBe(2);
    } finally {
      pine.close();
    }
  });
});

/**
 * The Linux PINE (the HD texture-dump job on the AWS seat box; agent-mail/evidence/hd-gsdump-plan/RECIPE.md section 4):
 * PCSX2 v2.8.2 off Windows serves PINE on a Unix socket, `$XDG_RUNTIME_DIR/pcsx2.sock`, else `/tmp/pcsx2.sock`
 * (pcsx2/PINE.cpp:300-313 at v2.8.2, as the recipe reads it). The wire is the same.
 */
describe('the PINE socket path (Linux)', () => {
  it('is TCP on Windows unless a path is named', () => {
    expect(pineSocketPath({ platform: 'win32', env: { XDG_RUNTIME_DIR: '/run/user/1000' } })).toBeNull();
    expect(pineSocketPath({ platform: 'win32', env: {}, path: 'C:/x.sock' })).toBe('C:/x.sock');
  });

  it('off Windows: $XDG_RUNTIME_DIR/pcsx2.sock, else /tmp/pcsx2.sock; a named path always wins', () => {
    expect(pineSocketPath({ platform: 'linux', env: { XDG_RUNTIME_DIR: '/run/user/1000' } })).toBe('/run/user/1000/pcsx2.sock');
    expect(pineSocketPath({ platform: 'linux', env: { XDG_RUNTIME_DIR: '/run/user/1000/' } })).toBe('/run/user/1000/pcsx2.sock');
    expect(pineSocketPath({ platform: 'linux', env: {} })).toBe('/tmp/pcsx2.sock');
    expect(pineSocketPath({ platform: 'linux', env: { XDG_RUNTIME_DIR: '' } })).toBe('/tmp/pcsx2.sock');
    expect(pineSocketPath({ platform: 'linux', env: { XDG_RUNTIME_DIR: '/run/user/1000' }, path: '/srv/p.sock' })).toBe('/srv/p.sock');
  });

  it('falls back to /tmp/pcsx2.sock when the XDG socket is absent and the /tmp one is there', () => {
    const exists = (p: string): boolean => p === '/tmp/pcsx2.sock';
    expect(pineSocketPath({ platform: 'linux', env: { XDG_RUNTIME_DIR: '/run/user/1000' }, exists })).toBe('/tmp/pcsx2.sock');
    expect(pineSocketPath({ platform: 'linux', env: { XDG_RUNTIME_DIR: '/run/user/1000' }, exists: () => false })).toBe('/run/user/1000/pcsx2.sock');
  });

  it('connects over the path when one is given (a named pipe here, the same net.connect({ path }) as a Unix socket)', async () => {
    const path = process.platform === 'win32' ? `\\\\.\\pipe\\eph-pine-test-${process.pid}` : `${tmpdir()}/eph-pine-test-${process.pid}.sock`;
    const srv = createServer((sock: Socket) => {
      sock.on('data', (d: Buffer) => {
        if (d[4] !== OP.VERSION) return;
        const data = Buffer.from([10, 0, 0, 0, ...Buffer.from('PCSX2 2.8'), 0]);
        const head = Buffer.alloc(5);
        head.writeUInt32LE(5 + data.length, 0);
        sock.write(Buffer.concat([head, data]));
      });
    });
    await new Promise<void>((done) => srv.listen(path, () => done()));
    try {
      const pine = await PineClient.connect({ path });
      try { expect(await pine.version()).toBe('PCSX2 2.8'); } finally { pine.close(); }
      await expect(PineClient.connect({ path: `${path}-absent`, timeoutMs: 2000 })).rejects.toThrow(/PINE: cannot connect to .*-absent/);
    } finally {
      await new Promise<void>((done) => srv.close(() => done()));
    }
  });
});
