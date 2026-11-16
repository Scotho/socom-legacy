/**
 * Stage 1's host-owned worker (design section 5). The module is imported here, not on the match thread.
 * Messages are JSON in and JSON out. A throw is `{ ok: false }`. The parent terminates this worker on a trip
 * or at the next round. `moduleUrl` is a `data:` URL of the bytes the loader already checked, not a path.
 */
import { parentPort, workerData } from 'node:worker_threads';

const port = parentPort;
if (!port) throw new Error('plugin worker');

/** @type {((input: unknown) => unknown) | null} */
let hook = null;
/** @type {{ id: number; input: unknown }[]} */
const waiting = [];

port.on('message', (msg) => {
  if (!msg || msg.t !== 'ask') return;
  if (!hook) { waiting.push(msg); return; }
  void answer(msg);
});

/**
 * @param {{ id: number; input: unknown }} msg
 */
async function answer(msg) {
  try {
    const value = await hook(msg.input);
    const json = JSON.stringify(value);
    if (typeof json !== 'string') throw new Error('plugin');
    port.postMessage({ t: 'reply', id: msg.id, ok: true, json });
  } catch {
    port.postMessage({ t: 'reply', id: msg.id, ok: false });
  }
}

try {
  const mod = await import(workerData.moduleUrl);
  if (typeof mod.default !== 'function') throw new Error('plugin');
  hook = mod.default;
  port.postMessage({ t: 'ready', ok: true });
  for (const msg of waiting.splice(0)) void answer(msg);
} catch {
  port.postMessage({ t: 'ready', ok: false });
}
