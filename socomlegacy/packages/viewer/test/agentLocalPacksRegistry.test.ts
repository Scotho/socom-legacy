import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createLocalPackApi } from '../src/agent/localPacks';
import { createPackRegistry } from '../src/packs/registry';
import { memoryModLibrary } from '../src/mods/store';
import { memoryUploadBackend, UploadedPacks } from '../src/texturePackStore';

/** LATER 445 (product track): the agent's local packs keep no registry of their own; they are XT-4's one registry. */
const store = () => { const data = new Map<string, string>(); return { get: (k: string) => data.get(k) ?? null, set: (k: string, v: string) => { data.set(k, v); } }; };
const options = () => ({ mods: memoryModLibrary(), maps: store(), models: { read: async () => null, put: async () => {}, remove: async () => {} },
  textures: new UploadedPacks(memoryUploadBackend()) });

describe('LATER 445: one pack registry', () => {
  it('the agent facade lists exactly what the registry over the same stores lists', async () => {
    const config = options();
    await config.mods.put({ id: 'local-demo', label: 'Local demo', files: [{ name: 'hello.txt', bytes: Uint8Array.of(1, 2, 3) }] });
    const agent = createLocalPackApi(config), registry = createPackRegistry(config);
    try {
      const listed = await agent.list();
      expect(listed.map((p) => p.id)).toContain('mod:local-demo');
      expect(listed).toEqual(await registry.list());
    } finally { agent.dispose(); registry.dispose(); }
  });

  it('the facade holds no store, map or second catalogue of its own: it delegates to createPackRegistry', () => {
    const text = readFileSync(new URL('../src/agent/localPacks.ts', import.meta.url), 'utf8');
    expect(text).toMatch(/export \* from '\.\.\/packs\/registry';/);
    expect(text).toMatch(/return createPackRegistry\(\{ \.\.\.options, legacyMapWrites: true \}\);/);
    expect(text).not.toMatch(/localStorage|indexedDB|new Map|new Set|\bclass\b|catalogue/i);
  });
});
