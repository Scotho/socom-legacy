/**
 * H337 / LATER 308's capture instrument (a product-track instrument, an adaptation: it reads the original running
 * under PCSX2 and changes nothing the port does). It polls PCSX2's PINE socket as fast as it answers, for `--seconds`,
 * and writes one NDJSON line a sample to `--out`: `{t, eye, target, eyeSmoothed, feet, look, clockWord, cam, actor,
 * renderCam, camB4}` (the fields, their addresses and their citations: `./h337PinePoll.ts`'s header). Then it prints
 * `summarise`'s verdict (research 201 section 14, "The capture's prediction").
 *
 *   npx tsx tools/parity/h337-pine-poll.ts --seconds 60 --out <a path outside every git work tree>
 *       [--port 28011 | 28012] [--expect x,y,z [--stand x,y,z]]
 *
 * - Reads only: every message is built by `encodeBatch`, which refuses any opcode but a read. Never a write, never a
 *   savestate. Every batch is READ64 commands (`read64Plan`), as the desktop's client batches.
 * - 127.0.0.1 only (`--host` exists to be refused otherwise); TCP, as the desktop's client on Windows
 *   (`desktop@be557831:tools_py/parity/pine.py:14`).
 * - `--out` outside this repository, outside the desktop's tree (`SOCOM_PC_ROOT`, and `C:/Projects/socom_pc`) and outside
 *   every git work tree, and never over an existing file.
 * - `--expect` is the port's `'target'` eye (`cam+0x2c`) at the stand, from research 201 section 14.1; without it a still
 *   eye is reported undecided. `--stand` is the feet that eye was computed at: the match tolerance (0.05) grows by the
 *   recorded feet's distance from it. Either way the verdict is provisional until the prediction is recomputed at the
 *   recorded feet.
 * - Each second a status line on stderr (feet, pitch, eye) so the stand can be found by hand while it runs.
 */
import { createWriteStream } from 'node:fs';
import { connect, type Socket } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  decodeBatch, encodeBatch, fieldAddrs, hostRefusal, isGuestPointer, parseArgs, pitchOf, POINTER_ADDRS, read64Plan, replyLength,
  summarise, toLine, type PineRead, type PollArgs, type PollLine,
} from './h337PinePoll';

/** One request and its reply at a time on one socket. */
class Pine {
  private buf = Buffer.alloc(0);
  private waiting: ((b: Buffer) => void) | null = null;
  private failed: Error | null = null;

  private constructor(private readonly socket: Socket) {
    socket.on('data', (chunk: Buffer) => { this.buf = Buffer.concat([this.buf, chunk]); this.take(); });
    socket.on('error', (err) => { this.failed = err; });
    socket.on('close', () => { this.failed ??= new Error('PINE closed'); });
  }

  static open(host: string, port: number): Promise<Pine> {
    const refused = hostRefusal(host);
    if (refused) return Promise.reject(new Error(refused));
    return new Promise((ok, fail) => {
      const s = connect({ host, port }, () => { s.off('error', fail); s.setNoDelay(true); ok(new Pine(s)); });
      s.once('error', fail);
    });
  }

  private take(): void {
    const total = replyLength(this.buf);
    if (!this.waiting || total === null || this.buf.length < total) return;
    const reply = this.buf.subarray(0, total);
    this.buf = this.buf.subarray(total);
    const w = this.waiting;
    this.waiting = null;
    w(reply);
  }

  batch(reads: readonly PineRead[]): Promise<(number | bigint)[]> {
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error('PINE: no reply in 2 s')), 2000);
      this.waiting = (reply) => {
        clearTimeout(timer);
        try { ok(decodeBatch(reply, reads)); } catch (err) { fail(err as Error); }
      };
      this.socket.write(encodeBatch(reads));
      this.take();
    });
  }

  /** 32-bit words at `addrs`, read as READ64 double words (`read64Plan`). */
  async words(addrs: readonly number[]): Promise<number[]> {
    const plan = read64Plan(addrs);
    return plan.words(await this.batch(plan.reads));
  }

  close(): void { this.socket.destroy(); }
}

export async function poll(args: PollArgs): Promise<PollLine[]> {
  const pine = await Pine.open(args.host, args.port);
  const out = createWriteStream(args.out, { flags: 'wx' });
  const lines: PollLine[] = [];
  const t0 = performance.now();
  let lastStatus = -1, skipped = 0;
  try {
    for (;;) {
      const t = (performance.now() - t0) / 1000;
      if (t >= args.seconds) break;
      const pointers = await pine.words(POINTER_ADDRS);
      const [cam, actor] = pointers as [number, number];
      if (!isGuestPointer(cam) || !isGuestPointer(actor)) { skipped++; continue; }      // between states: no camera or actor
      const line = toLine(Number(t.toFixed(4)), pointers, await pine.words(fieldAddrs(cam, actor)));
      lines.push(line);
      out.write(`${JSON.stringify(line)}\n`);
      if (Math.floor(t) !== lastStatus) {
        lastStatus = Math.floor(t);
        const f = (v: readonly number[]): string => v.map((x) => x.toFixed(2)).join(', ');
        process.stderr.write(`t ${lastStatus}s  feet (${f(line.feet)})  pitch ${pitchOf(line.look).toFixed(2)}  eye (${f(line.eye)})  samples ${lines.length}  skipped ${skipped}\n`);
      }
    }
  } finally {
    pine.close();
    await new Promise<void>((ok) => out.end(ok));
  }
  return lines;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args === 'string') { console.error(args); process.exit(2); }
  const lines = await poll(args);
  console.log(JSON.stringify({ out: args.out, ...summarise(lines, args.expect, 0.05, args.stand) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err: unknown) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
