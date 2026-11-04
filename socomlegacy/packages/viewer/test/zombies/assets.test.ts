// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { loadZombieAssets } from '../../src/zombies/assets';
import type { ZombiePack } from '../../src/zombies/pack';
import { CLIPS, glbWithClips, pcmWav } from './fixture';

function pack(glb: ArrayBuffer, cues: Record<string, string> = {}): ZombiePack {
  const wav = pcmWav();
  const files = new Map<string, Uint8Array>([['sounds/a.wav', wav]]);
  return {
    glb, bones: { head: 'Head' }, cues,
    groups: { Groans: ['sounds/a.wav'], Attacks: ['sounds/a.wav'], Deaths: ['sounds/a.wav'] },
    sound: (path) => files.get(path) ?? new Uint8Array(),
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

it('loads a synthetic model without fetching and stays silent when a cue is absent', async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  const assets = await loadZombieAssets(pack(glbWithClips(CLIPS)));
  expect(assets.clips.map((c) => c.name)).toEqual(expect.arrayContaining([...CLIPS]));
  const view = assets.create('armored');
  expect(view.root.children.length).toBeGreaterThan(0);
  expect(view.head?.()).toHaveLength(3);
  assets.cue('round-start');
  assets.sound('Groans', 10);
  assets.stop();
  view.dispose();
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('refuses a model with no height', async () => {
  await expect(loadZombieAssets(pack(glbWithClips(CLIPS, 0)))).rejects.toThrow('Invalid zombie model');
});

it('never lets the loader fetch: a URI outside the file is refused at the loader too (ask 3)', async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  const outside = glbWithClips(CLIPS, 2, (json) => { (json['buffers'] as { uri?: string }[])[0]!.uri = 'https://example.invalid/zombie.bin'; });
  await expect(loadZombieAssets(pack(outside))).rejects.toThrow('model names an address outside the file');
  expect(fetchSpy).not.toHaveBeenCalled();
});
