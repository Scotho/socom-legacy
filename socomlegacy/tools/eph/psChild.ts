import { spawn as nodeSpawn } from 'node:child_process';

/**
 * A long-lived helper child of the emulator parity harness (EPH-2 fold round 2, findings A and C): PowerShell reading
 * one request line on stdin and answering lines on stdout -- the key injector (./keys) and the window helper
 * (./window). Product track (OT.R53): a validation instrument, an adaptation, never in a build and never changing the
 * game's behaviour.
 *
 * Every stream is listened to: an 'error' on the process (a spawn failure), on stdin (EPIPE, a write to a child gone),
 * on stdout or stderr, and an 'exit' before close() are each reported once through `onFail` -- never an uncaught
 * exception, which would end the run past its `finally` and leave PCSX2 running.
 */

/** As much of a stream as the helper uses; a Node stream (and an EventEmitter fake) fits: its listener type is any[]. */
export interface StreamLike {
  on(event: string, fn: (...args: any[]) => void): unknown;
}

/** As much of a ChildProcess as the helper uses (a fake in the tests). */
export interface ProcLike extends StreamLike {
  readonly stdin: (StreamLike & { write(s: string): unknown; end(): unknown }) | null;
  readonly stdout: (StreamLike & { setEncoding(e: 'utf8'): unknown }) | null;
  readonly stderr: (StreamLike & { setEncoding(e: 'utf8'): unknown }) | null;
}

export type ProcSpawn = (cmd: string, args: readonly string[]) => ProcLike;

/** The host's spawn: no window, every stdio a pipe. */
export const spawnProc: ProcSpawn = (cmd, args) => nodeSpawn(cmd, [...args], { windowsHide: true });

export interface LineChildHooks {
  /** Each stdout line, without its line end. */
  readonly onLine: (line: string) => void;
  /** Each stderr line; default dropped. */
  readonly onStderr?: (line: string) => void;
  /** The first failure, once; none after close(). */
  readonly onFail: (err: Error) => void;
}

/** Splits a text stream into lines across chunks. */
function lines(stream: StreamLike & { setEncoding(e: 'utf8'): unknown }, each: (line: string) => void): void {
  let rest = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    const parts = (rest + chunk).split(/\r?\n/);
    rest = parts.pop() ?? '';
    for (const l of parts) if (l) each(l);
  });
}

export class LineChild {
  private closing = false;
  private failed: Error | null = null;

  constructor(private readonly p: ProcLike, readonly what: string, hooks: LineChildHooks) {
    const fail = (err: Error): void => {
      if (this.failed || this.closing) return;
      this.failed = err;
      hooks.onFail(err);
    };
    p.on('error', (err: Error) => fail(new Error(`${what}: failed: ${err.message}`)));
    p.on('exit', (code: number | null, sig: string | null) => fail(new Error(`${what}: exited (${code ?? sig ?? 'unknown'})`)));
    p.stdin?.on('error', (err: Error) => fail(new Error(`${what}: stdin failed: ${err.message}`)));
    if (p.stdout) {
      lines(p.stdout, hooks.onLine);
      p.stdout.on('error', (err: Error) => fail(new Error(`${what}: stdout failed: ${err.message}`)));
    }
    if (p.stderr) {
      lines(p.stderr, hooks.onStderr ?? (() => undefined));
      p.stderr.on('error', (err: Error) => fail(new Error(`${what}: stderr failed: ${err.message}`)));
    }
  }

  /** The failure reported, if any. */
  get failure(): Error | null { return this.failed; }

  /** Writes one request; throws the failure once the child has failed, or when closed. */
  write(line: string): void {
    if (this.failed) throw this.failed;
    if (this.closing) throw new Error(`${this.what}: closed`);
    this.p.stdin?.write(line);
  }

  /** Ends stdin (the child's loop then ends); later errors and the exit are expected and not reported. */
  close(): void {
    if (this.closing) return;
    this.closing = true;
    try { this.p.stdin?.end(); } catch { /* the pipe is gone */ }
  }
}
