import { parseBankFile, renderSound, SampleBudget, SampleCache, type MixOutput, type RenderedSound, type SoundBank } from '@s2u/sound';

/**
 * OFF_THREAD_RENDER_ADAPTATION (a browser adaptation for the Xbox class, opt-in; no original -- the console's voices
 * play on its sound processor, at no cost to the frame): a one-shot's render moved from the page's thread to a worker.
 *
 * Every play is rendered when it is asked (`@s2u/sound` `renderSound`: the console's own mix of that sound, at that
 * play's volume and pan). On the Series X's page thread a render ran about 5 ms, and a firefight asks for some forty a
 * second: 2 to 8 ms of every 33 ms frame, in bursts inside the socket's message handler, so the frame missed its
 * refresh (Developer Mode, 2026-11-20: 22 to 25 frames a second in a fight with the renders on the page's thread, 29.6
 * with the sound off). With a renderer set (`GameAudio.setOffThreadRenderer`) the play's place, volume and pan are taken
 * at the call as before, the worker runs the same `renderSound` on the same bank file, and the mix is played when it
 * comes back -- a few milliseconds after the call. The grains' random picks are the worker's own draws
 * (`Math.random`), and its RAND_PLAY / PLAY_CYCLE memory is its own, kept across its plays as the page keeps its own.
 * Unset (the default, every page but the lightweight match): each play renders at its call, exactly as before.
 */
export interface OneShotRequest {
  /** The bank's index in the set last given to `setBanks`, and the sound's in the bank. */
  bank: number; index: number;
  vol: number; pan: number; globals: readonly number[]; modifier: number | null;
}

export interface OffThreadStats {
  asked: number; played: number; failed: number;
  /** The most renders waiting at once, and the request-to-mix wait: its mean and its longest, ms. */
  waitingMax: number; waitMeanMs: number; waitMaxMs: number;
}

export interface OffThreadRenderer {
  /** The bank files a render names by index; replaces the last set, and lets go of every render still waiting. */
  setBanks(files: readonly Uint8Array[]): void;
  /**
   * Asks for a render. False: not taken (the worker is gone) -- the caller renders it itself. True: `done` is called
   * once, later, with the mix or with null (the banks changed meanwhile, or the render failed). The mix's arrays are
   * the caller's only for the length of that call: they go back to the worker after it.
   */
  render(request: OneShotRequest, done: (sound: RenderedSound | null) => void): boolean;
  stats(): OffThreadStats;
  dispose(): void;
}

export type RenderHostMessage =
  | { type: 'banks'; epoch: number; files: Uint8Array[] }
  | { type: 'render'; id: number; epoch: number; request: OneShotRequest }
  | { type: 'recycle'; buffers: ArrayBuffer[] };
export type RenderHostReply =
  | { id: number; left: Float32Array; right: Float32Array; sendLeft: Float32Array | null; sendRight: Float32Array | null; sampleRate: number; voices: number; peak: number }
  | { id: number; left: null };

/** The worker's decoded samples, in bytes: the least recently used let go past it (decoded again at their next use). */
export const OFF_THREAD_DECODE_BYTES = 16 * 1024 * 1024;
/** The most output storage the worker keeps for reuse, in bytes, and the smallest block it makes. */
const POOL_BYTES = 8 * 1024 * 1024, MIN_BLOCK_BYTES = 64 * 1024;

/**
 * The worker's side: banks parsed from their files, one-shots rendered into pooled storage and posted with it.
 * `post` is the worker's `postMessage`; `random` the grains' generator (the tests fix it).
 */
export function renderHost(post: (reply: RenderHostReply, transfer: ArrayBuffer[]) => void, random: () => number = Math.random): (message: RenderHostMessage) => void {
  let epoch = -1, banks: ({ bank: SoundBank; samples: SampleCache } | null)[] = [];
  const state = new Map<string, number>();
  const pool: ArrayBuffer[] = [];
  let pooled = 0;
  const take = (frames: number): Float32Array => {
    const bytes = frames * Float32Array.BYTES_PER_ELEMENT;
    for (let i = 0; i < pool.length; i++) {
      const buffer = pool[i]!;
      if (buffer.byteLength >= bytes && buffer.byteLength <= Math.max(MIN_BLOCK_BYTES, bytes * 4)) {
        pool.splice(i, 1); pooled -= buffer.byteLength;
        return new Float32Array(buffer, 0, frames);
      }
    }
    let size = MIN_BLOCK_BYTES;
    while (size < bytes) size *= 2;
    return new Float32Array(new ArrayBuffer(size), 0, frames);
  };
  return message => {
    if (message.type === 'banks') {
      epoch = message.epoch; state.clear();
      const budget = new SampleBudget(OFF_THREAD_DECODE_BYTES);
      banks = message.files.map(bytes => {
        try { const bank = parseBankFile(bytes); return { bank, samples: new SampleCache(bank.vag, budget) }; } catch { return null; }
      });
      return;
    }
    if (message.type === 'recycle') {
      for (const buffer of message.buffers) if (buffer.byteLength > 0 && pooled + buffer.byteLength <= POOL_BYTES) { pool.push(buffer); pooled += buffer.byteLength; }
      return;
    }
    const { id, request } = message, held = message.epoch === epoch ? banks[request.bank] : null;
    if (!held) { post({ id, left: null }, []); return; }
    try {
      const sound = renderSound(held.bank, request.index, held.samples, {
        vol: request.vol, pan: request.pan, globals: request.globals, modifier: request.modifier, random, state,
        output: (frames, send): MixOutput => ({ left: take(frames), right: take(frames), sendLeft: send ? take(frames) : null, sendRight: send ? take(frames) : null }),
      });
      // A silent sound (no frames) asked for no storage: its empty arrays are its own.
      const channels = [sound.left, sound.right, sound.sendLeft, sound.sendRight].filter((c): c is Float32Array => c !== null && c.byteLength > 0);
      post({ id, left: sound.left, right: sound.right, sendLeft: sound.sendLeft, sendRight: sound.sendRight, sampleRate: sound.sampleRate, voices: sound.voices, peak: sound.peak },
        [...new Set(channels.map(c => c.buffer as ArrayBuffer))]);
    } catch {
      post({ id, left: null }, []);
    }
  };
}

/** What the page's side needs of a `Worker`. */
export interface RenderWorker {
  postMessage(message: RenderHostMessage, transfer: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: { data: RenderHostReply }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessageerror?: ((event: unknown) => void) | null;
}

/** The page's side: requests numbered and awaited, the banks sent as copies, the mixes' storage sent back after use. */
export function workerRenderer(worker: RenderWorker, now: () => number = () => performance.now()): OffThreadRenderer {
  const waiting = new Map<number, { done: (sound: RenderedSound | null) => void; at: number }>();
  const counts = { asked: 0, played: 0, failed: 0, waitingMax: 0, waitMs: 0, waitMaxMs: 0 };
  let next = 1, epoch = 0, gone = false;
  const letGo = (): void => { const all = [...waiting.values()]; waiting.clear(); for (const { done } of all) { counts.failed++; done(null); } };
  const fail = (): void => { if (gone) return; gone = true; letGo(); try { worker.terminate(); } catch { /* already gone */ } };
  worker.onerror = fail;
  worker.onmessageerror = fail;
  worker.onmessage = ({ data }) => {
    const asked = waiting.get(data.id);
    waiting.delete(data.id);
    const buffers = data.left ? [...new Set([data.left, data.right, data.sendLeft, data.sendRight].filter((c): c is Float32Array => c !== null && c.byteLength > 0).map(c => c.buffer as ArrayBuffer))] : [];
    try {
      if (!asked) return;                                   // let go by a change of banks
      if (!data.left) { counts.failed++; asked.done(null); return; }
      const waited = now() - asked.at;
      counts.played++; counts.waitMs += waited; counts.waitMaxMs = Math.max(counts.waitMaxMs, waited);
      asked.done({ left: data.left, right: data.right, sendLeft: data.sendLeft, sendRight: data.sendRight, sampleRate: data.sampleRate, voices: data.voices, samples: [], peak: data.peak });
    } finally {
      if (!gone && buffers.length > 0) { try { worker.postMessage({ type: 'recycle', buffers }, buffers); } catch { /* the storage is let go */ } }
    }
  };
  return {
    setBanks(files) {
      if (gone) return;
      epoch++; letGo();
      // Copies: a bank file can be a view of a larger buffer, and a posted view carries its whole buffer.
      const copies = files.map(bytes => bytes.slice());
      try { worker.postMessage({ type: 'banks', epoch, files: copies }, copies.map(copy => copy.buffer)); } catch { fail(); }
    },
    render(request, done) {
      if (gone) return false;
      const id = next++;
      try { worker.postMessage({ type: 'render', id, epoch, request: { ...request, globals: [...request.globals] } }, []); } catch { fail(); return false; }
      waiting.set(id, { done, at: now() });
      counts.asked++; counts.waitingMax = Math.max(counts.waitingMax, waiting.size);
      return true;
    },
    stats: () => ({ asked: counts.asked, played: counts.played, failed: counts.failed, waitingMax: counts.waitingMax,
      waitMeanMs: counts.played > 0 ? counts.waitMs / counts.played : 0, waitMaxMs: counts.waitMaxMs }),
    dispose() { if (gone) return; gone = true; waiting.clear(); try { worker.terminate(); } catch { /* already gone */ } },
  };
}
