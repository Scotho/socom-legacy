import { expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ read: vi.fn(), data: vi.fn() }));
vi.mock('../src/frontEnd', () => ({ readFrontEndDisc: calls.read }));
vi.mock('../src/frontEndAssets', () => ({ pageUiTextures: () => ({ ready: Promise.resolve([]), textures: () => null }) }));
vi.mock('../src/audio', () => ({ WebAudioOut: class { unlock() {} }, GameAudio: class { setData = calls.data; play() {} stopMusic() {} } }));
vi.mock('../src/uiSoundHost', () => ({ pageUiSounds: async (_s: unknown, a: { setData(d: unknown): void }) => { a.setData({ old: true }); return { missing: [], cues: null }; } }));
import { TauntEditor } from '../src/tauntEditor';

it.each(['resolve', 'reject'] as const)('a stale editor %s cannot clear or close the newer editor', async outcome => {
  let resolve!: (data: unknown) => void, reject!: (error: Error) => void;
  calls.read.mockReset(); calls.data.mockClear();
  calls.read.mockImplementationOnce(() => new Promise((yes, no) => { resolve = yes; reject = no; }));
  calls.read.mockImplementationOnce(() => new Promise(() => {}));
  const editor = new TauntEditor(), first = editor.open({} as never, []);
  editor.close(); void editor.open({} as never, []);
  calls.data.mockClear();
  if (outcome === 'resolve') resolve({}); else reject(Error('old read failed'));
  await first;
  expect(editor.isOpen()).toBe(true);
  expect(calls.data).not.toHaveBeenCalled();
  editor.close();
});
