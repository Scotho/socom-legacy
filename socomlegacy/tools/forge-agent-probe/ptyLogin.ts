/** Product adaptation: bounded terminal-backed OAuth login; never a model/shell execution channel. */
import { stripVTControlCharacters } from 'node:util';
import { killTree, type CliResult } from './client';
import { terminalAuthorizationText } from './nativeOAuth';
interface Disposable { dispose(): void }
interface Terminal { pid: number; write(value: string): void; kill(): void;
  onData(callback: (value: string) => void): Disposable; onExit(callback: (value: { exitCode: number }) => void): Disposable }
export interface PtyFactory { spawn(executable: string, args: string[], options: { cwd: string; env: Record<string, string>;
  cols: number; rows: number; name: string; useConpty: boolean }): Terminal }
async function loadPty(): Promise<PtyFactory> {
  // Dynamic optional dependency: ordinary game builds/typechecks must work when its native binary is absent.
  const name = 'node-pty';
  try { const module = await import(name); return module.default ?? module; } catch { throw Error('OPTIONAL_NODE_PTY_REQUIRED'); }
}
// killTree rejects when the kill fails: the login retries and confirms termination before it releases the profile (LATER 449).
const KILL_ATTEMPTS = 3, KILL_RETRY_MS = 500, EXIT_GRACE_MS = 2_000;
type Options = { executable: string; args: string[]; directory: string; env: NodeJS.ProcessEnv; prompt: string;
  timeoutMs: number; signal?: AbortSignal; dialogue?: (line: string) => Promise<string | undefined> };
export async function launchPtyLogin(options: Options, factory?: PtyFactory, terminate: (pid: number) => Promise<void> = killTree): Promise<CliResult> {
  if (JSON.stringify(options.args) !== JSON.stringify(['mcp', 'login', '--no-browser', 'socom2legacy']) || options.prompt)
    throw Error('PTY_LOGIN_COMMAND_REQUIRED');
  const pty = factory ?? await loadPty();
  // node-pty 1.1.0 API: https://github.com/microsoft/node-pty/blob/1def5774632305246fe21f0f69e23a664d6c5910/typings/node-pty.d.ts
  // Wide terminal prevents an authorization URL being hard-wrapped into several input lines.
  let terminal: Terminal;
  try { terminal = pty.spawn(options.executable, options.args, { cwd: options.directory,
    env: Object.fromEntries(Object.entries(options.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
    cols: 4096, rows: 30, name: 'xterm', useConpty: true }); } catch { throw Error('NATIVE_PTY_LAUNCH_FAILED'); }
  return new Promise<CliResult>((resolve, reject) => {
    let settled = false, exited = false, confirmed = false, timedOut = false, outputError = false, partial = '', bytes = 0;
    let stopping: Promise<void> | undefined, fallback: ReturnType<typeof setTimeout> | undefined;
    const listeners: Disposable[] = [];
    const finish = async (exitCode: number | null): Promise<void> => {
      if (settled) return; settled = true;
      clearTimeout(timer); clearTimeout(fallback); options.signal?.removeEventListener('abort', abort);
      for (const listener of listeners) listener.dispose();
      await stopping;
      // node-pty 1.1.0 naturally closes its sockets before onExit. Calling kill afterward starts a console-list
      // helper against an already exited PID (AttachConsole failure). Keep forced kill for unfinished exits only.
      // microsoft/node-pty@1def5774632305246fe21f0f69e23a664d6c5910 src/windowsPtyAgent.ts natural exit cleanup.
      if (!exited) try { terminal.kill(); } catch { /* already terminated */ }
      partial = '';
      // The terminal may still hold the client profile: never report it released (LATER 449).
      if (stopping && !exited && !confirmed) reject(Error('NATIVE_PTY_TERMINATION_UNCONFIRMED'));
      else resolve({ exitCode, timedOut, outputError });
    };
    const stop = (): void => {
      if (stopping || settled) return;
      stopping = (async () => {
        // A failed kill is retried: the profile is released only once the owned tree's end is confirmed.
        for (let attempt = 0; attempt < KILL_ATTEMPTS && !exited && !confirmed; attempt++) {
          if (attempt) await new Promise(done => setTimeout(done, KILL_RETRY_MS));
          if (exited) break;
          try { await terminate(terminal.pid); confirmed = true; } catch { outputError = true; }
          if (!exited) try { terminal.kill(); } catch { /* already terminated */ }
        }
      })();
      // Even an absent exit notification must settle as failure after the owned process termination attempts.
      void stopping.then(() => { if (!settled) fallback = setTimeout(() => { void finish(null); }, EXIT_GRACE_MS); });
    };
    const abort = (): void => { timedOut = true; stop(); };
    const timer = setTimeout(abort, options.timeoutMs);
    options.signal?.addEventListener('abort', abort, { once: true });
    listeners.push(terminal.onExit(({ exitCode }) => { exited = true; void finish(exitCode); }));
    listeners.push(terminal.onData(chunk => {
      if (settled) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > 1024 * 1024) { outputError = true; stop(); return; }
      partial += chunk; const lines = partial.split(/\r?\n/); partial = lines.pop() ?? '';
      for (const line of lines) {
        // Terminal output/input can contain OAuth material. It remains private to this callback and is discarded.
        void Promise.resolve().then(() => {
          const visible = stripVTControlCharacters(line);
          // Stripping may reconstruct an authorization marker in a label. It decides eligibility only;
          // authoritative hyperlink metadata must still be read from the unchanged raw line.
          const eligible = line.includes('redirect_uri=') || visible.includes('redirect_uri=');
          const text = eligible ? stripVTControlCharacters(terminalAuthorizationText(line)) : visible;
          return options.dialogue?.(text);
        }).then(reply => {
          if (reply !== undefined && !settled) terminal.write(reply + '\r');
        }).catch(() => { outputError = true; stop(); });
      }
    }));
    if (options.signal?.aborted) abort();
  });
}
