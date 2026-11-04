/** Product adaptation: actual installed CLI invocation, no synthetic replacement client. */
import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { clientInvocation, loadAccessOnlySubscription, withIsolatedProfile, type ClientName } from './isolation';
import { ClientSetupError, setupError, setupStage } from './diagnostics';
import { unexpectedToolEvent, observeClientEvidence, type ClientEvents } from './events';
/** Explicit in-memory debugging seam. The harness never includes this text in a report or saves it. */
export interface ClientMessage { kind: 'warning' | 'agent-explanation'; text: string }

export interface CliResult { exitCode: number | null; timedOut: boolean; outputError: boolean; clientError?: true; nonMcpTool?: true; clientEvents?: ClientEvents }
const execute = promisify(execFile);
/** Fail closed on tool-bearing items; messages/reasoning are metadata, not permission to execute builtins. */
export function isUnexpectedToolEvent(event: any): boolean {
  const summary = unexpectedToolEvent(event);
  return summary !== undefined && summary.kind !== 'ERROR_ITEM';
}
export function installedClient(client: ClientName, env: NodeJS.ProcessEnv): { executable: string; prefix: string[] } {
  if (process.platform !== 'win32') return { executable: client, prefix: [] };
  if (client === 'claude') {
    const executable = join(env.USERPROFILE ?? '', '.local', 'bin', 'claude.exe');
    if (!existsSync(executable)) throw Error('INSTALLED_CLIENT_REQUIRED');
    return { executable, prefix: [] };
  }
  const script = join(env.APPDATA ?? '', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  if (!existsSync(script)) throw Error('INSTALLED_CLIENT_REQUIRED');
  return { executable: process.execPath, prefix: [script] };
}
export async function runClient(options: { client: ClientName; endpoint: string; prompt: string; timeoutMs: number; signal?: AbortSignal; env?: NodeJS.ProcessEnv; onMessage?: (message: ClientMessage) => void }): Promise<CliResult> {
  const environment = options.env ?? process.env;
  const binary = await setupStage('CLIENT_LOOKUP', 'INSTALLED_CLIENT_REQUIRED', () => installedClient(options.client, environment));
  let completed: CliResult | undefined;
  try {
    return await withIsolatedProfile(async directory => {
      const access = await setupStage('CLIENT_AUTH_SNAPSHOT', 'ACCESS_SNAPSHOT_FAILED', () => loadAccessOnlySubscription(options.client, directory, environment, options.timeoutMs));
      const invocation = await setupStage('CLIENT_CONFIG_WRITE', 'CLIENT_CONFIG_WRITE_FAILED', () => clientInvocation(options.client, directory, options.endpoint, options.prompt, environment, access));
      completed = await setupStage('CLIENT_LAUNCH', 'CLIENT_LAUNCH_FAILED', () => launchChild({ executable: binary.executable, args: [...binary.prefix, ...invocation.args], directory,
        env: invocation.env, prompt: options.prompt, timeoutMs: options.timeoutMs, signal: options.signal, onMessage: options.onMessage }));
      return completed;
    });
  } catch (error) { if (error instanceof ClientSetupError && completed) error.child = completed; throw error; }
}
/** No browser/model invocation: check the same lookup, isolated profile, access snapshot and config path. */
export async function preflightClient(options: { client: ClientName; endpoint: string; timeoutMs: number; env?: NodeJS.ProcessEnv }) {
  const environment = options.env ?? process.env;
  const binary = await setupStage('CLIENT_LOOKUP', 'INSTALLED_CLIENT_REQUIRED', () => installedClient(options.client, environment));
  await withIsolatedProfile(async directory => {
    const access = await setupStage('CLIENT_AUTH_SNAPSHOT', 'ACCESS_SNAPSHOT_FAILED', () => loadAccessOnlySubscription(options.client, directory, environment, options.timeoutMs));
    const invocation = await setupStage('CLIENT_CONFIG_WRITE', 'CLIENT_CONFIG_WRITE_FAILED', () => clientInvocation(options.client, directory, options.endpoint, '', environment, access));
    const result = await setupStage('CLIENT_PREFLIGHT_LAUNCH', 'CLIENT_PREFLIGHT_LAUNCH_FAILED', () => launchChild({ executable: binary.executable,
      args: [...binary.prefix, '--version'], directory, env: invocation.env, prompt: '', timeoutMs: Math.min(options.timeoutMs, 10_000) }));
    if (result.exitCode !== 0 || result.outputError || result.timedOut) throw new ClientSetupError('CLIENT_PREFLIGHT_LAUNCH', 'CLIENT_PREFLIGHT_NONZERO');
  });
  return { client: options.client, status: 'ready' as const, evidence: 'non-model-client-preflight' as const };
}
/** The probe's one kill of an owned process tree (LATER 450): taskkill /T /F on Windows, the process group elsewhere.
 * Rejects when the kill fails, so each caller chooses its fallback and confirms termination before releasing a profile. */
export async function killTree(pid: number): Promise<void> {
  if (process.platform === 'win32') await execute('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 10_000 });
  else process.kill(-pid, 'SIGKILL');
}
/** Process-only unit seam; synthetic child tests are never classified as actual-client acceptance. */
export async function launchChild(options: { executable: string; args: string[]; directory: string; env: NodeJS.ProcessEnv;
  prompt: string; timeoutMs: number; signal?: AbortSignal; onEvent?: (event: any) => void;
  dialogue?: (line: string) => Promise<string | undefined>; onMessage?: (message: ClientMessage) => void }): Promise<CliResult> {
    return new Promise<CliResult>((resolve, reject) => {
      const child = spawn(options.executable, options.args, { cwd: options.directory, env: options.env,
        windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
      let timedOut = false, outputError = false, clientError = false, nonMcpTool = false, bytes = 0, partial = '', stderrPartial = '', settled = false;
      const clientEvents: ClientEvents = { jsonLines: 0, nonJsonLines: 0, unexpectedEvents: 0, warningEvents: 0 };
      let killing: Promise<void> | undefined;
      const stop = (): void => {
        if (!child.pid || killing) return;
        // Kill only this run's child and descendants; do not release its profile until termination completes.
        killing = (async () => {
          try { await killTree(child.pid!); } catch { child.kill(process.platform === 'win32' ? undefined : 'SIGKILL'); }
        })();
      };
      const timer = setTimeout(() => { timedOut = true; stop(); }, options.timeoutMs);
      const abort = (): void => { timedOut = true; stop(); };
      options.signal?.addEventListener('abort', abort, { once: true });
      const cleanup = (): void => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); };
      const dialogue = (line: string): void => {
        if (!options.dialogue) return;
        void options.dialogue(line).then(reply => { if (reply !== undefined && !child.stdin.destroyed) child.stdin.write(reply + '\n'); },
          () => { outputError = true; stop(); });
      };
      const consume = (line: string, active: boolean): void => {
        if (!line.trim()) return;
        if (active) dialogue(line);
        try {
          const event = JSON.parse(line);
          clientEvents.jsonLines++;
          observeClientEvidence(clientEvents, event);
          if (event.type === 'error' || event.type === 'turn.failed' || event.is_error === true) { outputError = true; clientError = true; }
          const unexpected = unexpectedToolEvent(event);
          // Codex maps nonfatal config warnings/deprecations to ErrorItem, with status Running; fatal errors
          // are top-level error/turn.failed. Pinned source: openai/codex@970111f6cb62cc02fe36a82ea7d71b37a2889c97
          // codex-rs/exec/src/event_processor_with_jsonl_output.rs:L389-L450, L517-L535:
          // https://github.com/openai/codex/blob/970111f6cb62cc02fe36a82ea7d71b37a2889c97/codex-rs/exec/src/event_processor_with_jsonl_output.rs#L389
          if (unexpected?.kind === 'ERROR_ITEM') { clientEvents.warningEvents++; clientEvents.firstWarning ??= unexpected; }
          else if (unexpected) { clientEvents.unexpectedEvents++; clientEvents.firstUnexpected ??= unexpected;
            outputError = true; nonMcpTool = true; if (active) stop(); }
          if (!unexpected || unexpected.kind === 'ERROR_ITEM') {
            try {
              options.onEvent?.(event);
              if (event.type === 'item.completed' && ['error', 'agent_message'].includes(event.item?.type)) {
                const text = event.item.message ?? event.item.text;
                if (typeof text === 'string') options.onMessage?.({ kind: event.item.type === 'error' ? 'warning' : 'agent-explanation', text: text.slice(0, 12_000) });
              }
            } catch { outputError = true; if (active) stop(); }
          }
        } catch { clientEvents.nonJsonLines++; /* Human output is not acceptance evidence. */ }
      };
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 8 * 1024 * 1024) { outputError = true; stop(); return; }
        partial += chunk.toString('utf8');
        const lines = partial.split('\n'); partial = lines.pop() ?? '';
        for (const line of lines) consume(line, true);
      });
      // Never log stderr: OAuth URL parsing is private, bounded and never becomes durable output.
      child.stderr.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 8 * 1024 * 1024) { outputError = true; stop(); return; }
        if (!options.dialogue) return;
        stderrPartial += chunk.toString('utf8');
        const lines = stderrPartial.split('\n'); stderrPartial = lines.pop() ?? '';
        for (const line of lines) dialogue(line);
      });
      child.on('error', error => { cleanup(); if (!settled) { settled = true; reject(setupError('CLIENT_LAUNCH', 'CLIENT_LAUNCH_FAILED', error)); } });
      child.on('close', async code => {
        cleanup(); if (partial.trim()) consume(partial, false); await killing;
        if (!settled) { settled = true; resolve({ exitCode: code, timedOut, outputError, clientEvents,
          ...(clientError ? { clientError: true as const } : {}), ...(nonMcpTool ? { nonMcpTool: true as const } : {}) }); }
      });
      child.stdin.on('error', () => { outputError = true; });
      if (!options.dialogue) child.stdin.end(options.prompt);
      if (options.signal?.aborted) abort();
    });
}
