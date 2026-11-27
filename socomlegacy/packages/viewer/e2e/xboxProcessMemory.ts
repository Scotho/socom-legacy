import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Browser } from '@playwright/test';
import { bound } from './asyncBound';

const execute = promisify(execFile);
/** Desktop Windows screening only: the sum of private commit for one fresh Edge process group.
 * Samples can miss peaks; this neither measures GPU residency nor emulates retail Xbox's memory policy.
 */
export async function xboxProcessMemory(browser: Browser, sampleLimit = 600) {
  if (!Number.isInteger(sampleLimit) || sampleLimit < 2 || sampleLimit > 1800) throw new Error('Expected a bounded 2..1800 memory sample count');
  const samples: { atMs: number; phase: string; privateBytes: number }[] = [], errors: string[] = [];
  const begin = Date.now(), cdp = await bound(browser.newBrowserCDPSession(), 5000, 'Memory sampler CDP session stalled');
  const gpu = await bound(cdp.send('SystemInfo.getInfo'), 5000, 'Memory sampler GPU query stalled')
    .then(info => info.gpu).catch(async error => { await bound(cdp.detach(), 3000, 'Memory sampler detach stalled').catch(() => undefined); throw error; });
  let phase = 'opening', stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
  let pending = Promise.resolve();
  const sample = async () => {
    if (process.platform !== 'win32') return;
    const info = await bound(cdp.send('SystemInfo.getProcessInfo'), 3000, 'Memory sampler process query stalled');
    const ids = info.processInfo.map(p => Math.trunc(p.id)).filter(id => id > 0);
    if (!ids.length) throw new Error('No browser process IDs');
    const script = `$p=Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue; ($p | Measure-Object -Property PrivateMemorySize64 -Sum).Sum`;
    const output = await execute('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, timeout: 10000 });
    const privateBytes = Number(output.stdout.trim());
    if (!Number.isFinite(privateBytes) || privateBytes <= 0) throw new Error('Browser memory sample unavailable');
    samples.push({ atMs: Date.now() - begin, phase, privateBytes });
  };
  const loop = () => {
    pending = sample().catch(error => { errors.push(String(error)); }).then(() => {
      if (!stopped && samples.length < sampleLimit && errors.length < 3) timer = setTimeout(loop, 1000);
    });
  };
  loop();
  return {
    phase(next: string) { phase = next; },
    async stop() { stopped = true; clearTimeout(timer); await pending; await bound(cdp.detach(), 3000, 'Memory sampler detach stalled'); },
    report() { return { browserVersion: browser.version(), gpu: { devices: gpu.devices, auxAttributes: gpu.auxAttributes },
      metric: 'Sampled Windows PrivateMemorySize64 summed across CDP-reported process IDs for this browser; not Xbox memory or GPU residency',
      supported: process.platform === 'win32', peakBytes: samples.length ? Math.max(...samples.map(s => s.privateBytes)) : null,
      samples, errors, sampleLimit, capped: samples.length >= sampleLimit }; },
  };
}
