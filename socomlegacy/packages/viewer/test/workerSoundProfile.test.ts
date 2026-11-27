// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import type { RenderedSound } from '@s2u/sound';
import type { SoundData } from '../src/soundData';
import type { SoundPhaseReply, ViewerInbound, ViewerResponse } from '../src/worker';

const fixture = vi.hoisted(() => ({ data: null as SoundData | null, loops: [] as { name: string; sound: RenderedSound }[] }));
vi.mock('../src/soundData', async original => ({
  ...await original<typeof import('../src/soundData')>(),
  soundFromDisc: async () => fixture.data,
  renderAmbienceLoops: (data: SoundData) => {
    // The current algorithm must finish reading the banks before transfer.
    expect(data.banks[0]!.bytes.byteLength).toBe(8); return fixture.loops;
  },
  renderReverb: (data: SoundData) => { data.reverb.ir = { ll: new Float32Array(2), lr: new Float32Array(2), rl: new Float32Array(2), rr: new Float32Array(2), sampleRate: 48000 }; },
}));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** Worker protocol unit test, using real structured-clone detachment. It does
 * not measure a browser's process/native audio memory or replace disc checks. */
async function run(profileSound: boolean) {
  vi.resetModules();
  const bank = new Uint8Array(32), mono = Float32Array.of(0.2, 0.4, 0.6, 0.8);
  fixture.data = { banks: [{ file: 'fixture', bytes: bank.subarray(4, 12) }],
    streams: [{ sound: { left: mono, right: mono } }], reverb: { ir: null },
  } as unknown as SoundData;
  fixture.loops = [{ name: 'fixture', sound: { left: Float32Array.of(0.25, 0.5, 0.75, 1),
    right: Float32Array.of(-0.25, -0.5, -0.75, -1), sendLeft: null, sendRight: null } as RenderedSound }];
  const messages: (ViewerResponse | SoundPhaseReply)[] = [];
  let receive!: (event: MessageEvent<ViewerInbound>) => void;
  let done!: () => void, fail!: (error: Error) => void;
  const ended = new Promise<void>((resolve, reject) => { done = resolve; fail = reject; });
  vi.stubGlobal('self', {
    addEventListener: (_name: string, handler: typeof receive) => { receive = handler; },
    postMessage(message: ViewerResponse | SoundPhaseReply, transfer: Transferable[] = []) {
      const clone = structuredClone(message, { transfer }); messages.push(clone);
      if (clone.kind === 'soundLoops') done();
      else if (clone.kind === 'error') fail(new Error(clone.message));
    },
  });
  await import('../src/worker');
  receive({ data: { kind: 'sound', id: 5, source: { kind: 'http', baseUrl: 'https://fixture.invalid/' },
    path: 'RUN/MP2.ZDB', archive: 'MP2', ...(profileSound ? { profileSound: true } : {}) } } as MessageEvent<ViewerInbound>);
  await ended; return messages;
}

it('keeps the ordinary worker reply/transfer order unchanged and emits no profile without opt-in', async () => {
  const messages = await run(false); expect(messages.map(message => message.kind)).toEqual(['sound', 'soundLoops']);
  expect(fixture.data!.banks[0]!.bytes.byteLength).toBe(0); expect(fixture.loops[0]!.sound.left.byteLength).toBe(0);
});
it('reports bounded worker phases without moving transfers before rendering or altering the sample payload', async () => {
  const messages = await run(true);
  expect(messages.map(message => message.kind)).toEqual(['soundPhase', 'soundPhase', 'soundPhase', 'sound', 'soundPhase', 'soundLoops']);
  const phases = messages.filter(message => message.kind === 'soundPhase');
  expect(phases.map(message => message.sample.phase)).toEqual(['worker-data-ready', 'worker-loops-ready', 'worker-reverb-ready', 'worker-data-sent']);
  expect(phases[0]!.sample).toMatchObject({ atUnixMs: expect.any(Number), bankBytes: 32, streamBytes: 16, loopBytes: 0 });
  expect(phases[3]!.sample).toMatchObject({ bankBytes: 0, streamBytes: 0, reverbBytes: 0, loopBytes: 32, sourceBytes: 32 });
  const loops = messages.find(message => message.kind === 'soundLoops')!;
  expect(Array.from(loops.loops[0]!.sound.left)).toEqual([0.25, 0.5, 0.75, 1]);
  expect(Array.from(loops.loops[0]!.sound.right)).toEqual([-0.25, -0.5, -0.75, -1]);
});
