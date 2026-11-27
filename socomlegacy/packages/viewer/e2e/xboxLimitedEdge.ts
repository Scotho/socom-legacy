import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { waitPortFree } from './serverLifecycle';
import { bound } from './asyncBound';

type Sample = { time: number; phase: string; privateBytes: number; jobPeakBytes: number; members: number; observed: number };
export interface LimitedEdge {
  browser: Browser;
  phase(name: string): void;
  verifyMembership(): Promise<void>;
  stop(): Promise<void>;
  report(): object;
}
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Real Windows job commit cap for each fresh Edge process group. This is not
 * an Xbox emulator or a cap on driver/GPU residency. No existing profile is used.
 */
export async function launchLimitedEdge(capMiB: number, port: number, timeoutSeconds = 300): Promise<LimitedEdge> {
  if (process.platform !== 'win32') throw new Error('An enforced Edge memory cap requires Windows');
  if (!Number.isInteger(capMiB) || capMiB < 512 || capMiB > 4096) throw new Error('Expected a 512..4096 MiB browser cap');
  if (!Number.isInteger(port) || port < 5600 || port > 5699) throw new Error('Expected an owned debug port in 5600..5699');
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > 1800) throw new Error('Expected a 30..1800 second owned-job deadline');
  await waitPortFree(port);
  // Fresh profiles stay in the host's temporary directory, outside test artifacts.
  const output = join(tmpdir(), 's2u-capped-edge');
  await mkdir(output, { recursive: true });
  const child = spawn(process.env.PYTHON ?? 'python', [fileURLToPath(new URL('./windowsMemoryJob.py', import.meta.url)),
    String(capMiB), String(port), output, String(timeoutSeconds)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const limitBytes = capMiB * 1024 ** 2, flags = 0x2200;
  const samples: Sample[] = [], errors: string[] = [], membershipChecks: { at: number; processes: number }[] = [];
  let ready: { pid: number; capMiB: number; limitBytes: number; limitFlags: number; assignedBeforeExecution: boolean; timeoutSeconds: number } | null = null;
  let latestMembers = new Set<number>(), phase = 'opening capped browser', peakBytes = 0, stopped = false, closed = false;
  let pending = '', stderr = '', droppedSamples = 0, browser: Browser | null = null, stopPromise: Promise<void> | null = null;
  let exit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  const error = (message: string) => { if (errors.length < 16) errors.push(message); };
  const exited = new Promise<void>(resolve => {
    child.once('error', failure => error(failure.message));
    child.once('close', (code, signal) => { exit = { code, signal }; closed = true; resolve(); });
  });
  child.stdin.on('error', () => { /* A browser that exited may close the helper's input during cleanup. */ });
  child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-8192); });
  child.stdout.on('data', chunk => {
    pending += String(chunk);
    if (pending.length > 65536) { error('Job telemetry line exceeded its bound'); pending = ''; return; }
    let newline: number;
    while ((newline = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
      try {
        const record = JSON.parse(line);
        if (record.event === 'ready') {
          if (record.limitBytes !== limitBytes || record.limitFlags !== flags || record.assignedBeforeExecution !== true || record.timeoutSeconds !== timeoutSeconds) throw new Error('Job limit/deadline was not confirmed');
          ready = record;
        } else if (record.event === 'sample') {
          if (record.limitBytes !== limitBytes || record.limitFlags !== flags || !Array.isArray(record.ids)
            || !record.ids.every((id: unknown) => Number.isSafeInteger(id) && Number(id) > 0)) throw new Error('Invalid job membership/limit sample');
          latestMembers = new Set(record.ids);
          peakBytes = Math.max(peakBytes, record.jobPeakBytes);
          if (samples.length < 4096) samples.push({ time: record.time, phase, privateBytes: record.privateBytes,
            jobPeakBytes: record.jobPeakBytes, members: record.ids.length, observed: record.observed });
          else droppedSamples++;
        } else if (record.event === 'stopped') {
          stopped = record.cleaned === true; peakBytes = Math.max(peakBytes, record.peakBytes);
        } else throw new Error('Unknown job telemetry event');
      } catch (failure) { error(String(failure)); }
    }
  });
  const report = () => ({ metric: 'Windows job commit limit, raw kernel peak counter, and sampled process private bytes. The allocation control observed a kernel peak above the limit after a refused allocation; that counter is not proof of successfully committed or resident bytes. Excludes GPU residency; not Xbox emulation.',
    capMiB, limitBytes, timeoutSeconds, ready, peakBytes, samples, membershipChecks, droppedSamples, errors, exit, cleaned: stopped });
  const stop = () => stopPromise ??= (async () => {
    if (!closed) child.stdin.end('\n');
    try { await bound(exited, 10000, 'Capped browser helper did not close'); }
    catch (failure) {
      child.kill(); // Only this helper; its kernel job handle closes with it and kills its owned children.
      await bound(exited, 5000, 'Owned cap helper survived termination');
      throw failure;
    }
    if (!stopped || exit?.code !== 0 || errors.length || droppedSamples || samples.length < 2)
      throw new Error(`Capped browser evidence/cleanup incomplete: ${JSON.stringify(report())}; ${stderr}`);
    await waitPortFree(port);
  })();
  const verifyMembership = async () => {
    if (!browser) throw new Error('Capped browser is unavailable');
    const cdp = await bound(browser.newBrowserCDPSession(), 3000, 'CDP session creation stalled');
    let failed = false;
    try {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (errors.length || closed) throw new Error('Capped browser telemetry ended before membership verification');
        const processes = (await bound(cdp.send('SystemInfo.getProcessInfo'), 1000, 'CDP process query stalled')).processInfo;
        if (processes.length && processes.every(p => latestMembers.has(p.id))) {
          membershipChecks.push({ at: Date.now(), processes: processes.length }); return;
        }
        await delay(100);
      }
      throw new Error('CDP browser processes were not all observed inside the capped job');
    } catch (failure) { failed = true; throw failure; }
    finally {
      try { await bound(cdp.detach(), 3000, 'CDP detach stalled'); }
      catch (failure) { if (!failed) throw failure; }
    }
  };
  const closeBrowser = () => browser?.close() ?? Promise.resolve();
  try {
    const deadline = Date.now() + 30000;
    while (!ready && !closed && !errors.length && Date.now() < deadline) await delay(50);
    if (!ready || errors.length || closed) throw new Error(`Capped Edge did not start: ${errors.join('; ')} ${stderr}`);
    while (!browser && !closed && Date.now() < deadline) {
      try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }); }
      catch { await delay(100); }
    }
    if (!browser) throw new Error(`Capped Edge debugging endpoint did not open: ${stderr}`);
    await verifyMembership();
    return { browser, phase(next) { phase = next; }, verifyMembership, stop, report };
  } catch (failure) {
    // Job termination does not wait for a starved browser's CDP connection.
    await Promise.allSettled([bound(closeBrowser(), 3000, 'Capped browser close stalled'),
      stop().catch(cleanup => error(String(cleanup)))]);
    throw new Error(`${String(failure)}; cap evidence: ${JSON.stringify(report())}`);
  }
}
