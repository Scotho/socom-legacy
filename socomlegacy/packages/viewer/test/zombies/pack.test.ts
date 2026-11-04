import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { installModOverrides } from '../../src/mods/override';
import { ZOMBIE_PACK_LIMITS, ZOMBIE_PACK_PATH, ZombiePackRefusal, readZombiePack } from '../../src/zombies/pack';
import { makeZip } from '../zipFixture';
import { deflateRawSync } from 'node:zlib';
import { CLIPS, glbWithClips, goodPackBytes, packZip, pcmWav } from './fixture';

const reason = async (bytes: Uint8Array | null): Promise<string> => {
  try { await readZombiePack(bytes); return ''; }
  catch (error) { return error instanceof ZombiePackRefusal ? error.message : String(error); }
};

it('reads a pack and hands back its model, bones, groups and sounds', async () => {
  const pack = await readZombiePack(goodPackBytes());
  expect(new Uint8Array(pack.glb).byteLength).toBeGreaterThan(20);
  expect(pack.bones).toEqual({ head: 'Head', spine: 'Spine' });
  expect(pack.groups['Groans']).toEqual(['sounds/a.wav']);
  expect(pack.cues['round-start']).toBe('sounds/round-start.wav');
  expect(pack.sound('sounds/a.wav').byteLength).toBeGreaterThan(44);
});

it('refuses each bad pack with a stable reason', async () => {
  expect(await reason(null)).toBe('no PACK.ZIP');
  expect(await reason(new Uint8Array())).toBe('no PACK.ZIP');
  expect(await reason(new Uint8Array(32))).toBe('not a zip');
  expect(await reason(makeZip([{ name: 'pack.json', data: '{}' }], { zip64: true }))).toBe('not a zip');
  expect(await reason(new Uint8Array(ZOMBIE_PACK_LIMITS.archiveBytes + 1))).toBe(`pack is over ${ZOMBIE_PACK_LIMITS.archiveBytes} bytes`);
  expect(await reason(packZip({ json: { format: 's2u-zombies-pack', version: 1 }, extra: [{ name: 'nope', data: 'x' }] }).subarray(0, 0))).toBe('no PACK.ZIP');
  const noManifest = makeZip([{ name: 'zombie.glb', data: new Uint8Array([1, 2, 3]) }]);
  expect(await reason(noManifest)).toBe('no pack.json');
  expect(await reason(packZip({ json: '{not json' as never }))).toBe('invalid pack.json');
  expect(await reason(makeZip([{ name: 'pack.json', data: 'x'.repeat(ZOMBIE_PACK_LIMITS.manifestBytes + 1) }]))).toBe(`pack.json is over ${ZOMBIE_PACK_LIMITS.manifestBytes} bytes`);
  expect(await reason(packZip({ json: { format: 'nope', version: 1, model: 'zombie.glb', groups: { Groans: ['sounds/a.wav'], Attacks: ['sounds/a.wav'], Deaths: ['sounds/a.wav'] } } }))).toBe('wrong format');
  expect(await reason(packZip({ json: { format: 's2u-zombies-pack', version: 2, model: 'zombie.glb', groups: { Groans: ['sounds/a.wav'], Attacks: ['sounds/a.wav'], Deaths: ['sounds/a.wav'] } } }))).toBe('wrong version');
  expect(await reason(packZip({ json: { format: 's2u-zombies-pack', version: 1, model: 'missing.glb', groups: { Groans: ['sounds/a.wav'], Attacks: ['sounds/a.wav'], Deaths: ['sounds/a.wav'] } } }))).toBe('model missing');
  expect(await reason(packZip({ model: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) }))).toBe('model is not glTF 2.0 binary');
  expect(await reason(packZip({ model: new Uint8Array(glbWithClips(['idle'])) }))).toBe('missing animation: walk');
  expect(await reason(packZip({ json: { format: 's2u-zombies-pack', version: 1, model: 'zombie.glb', groups: { Groans: [], Attacks: ['sounds/a.wav'], Deaths: ['sounds/a.wav'] } } }))).toBe('group empty: Groans');
  expect(await reason(packZip({ json: { format: 's2u-zombies-pack', version: 1, model: 'zombie.glb', groups: { Groans: ['sounds/missing.wav'], Attacks: ['sounds/a.wav'], Deaths: ['sounds/a.wav'] } } }))).toBe('sound missing: sounds/missing.wav');
  expect(await reason(packZip({ json: { format: 's2u-zombies-pack', version: 1, model: '../zombie.glb', groups: { Groans: ['sounds/a.wav'], Attacks: ['sounds/a.wav'], Deaths: ['sounds/a.wav'] } } }))).toBe('invalid pack.json');
  const many = Array.from({ length: 65 }, () => 'sounds/a.wav');
  expect(await reason(packZip({ json: { format: 's2u-zombies-pack', version: 1, model: 'zombie.glb', groups: { Groans: many, Attacks: ['sounds/a.wav'], Deaths: ['sounds/a.wav'] } } }))).toBe(`more than ${ZOMBIE_PACK_LIMITS.sounds} sounds`);
  const fat = new Uint8Array(ZOMBIE_PACK_LIMITS.soundBytes + 1);
  expect(await reason(packZip({ sounds: { 'sounds/a.wav': fat, 'sounds/b.wav': pcmWav(), 'sounds/c.wav': pcmWav() }, json: { format: 's2u-zombies-pack', version: 1, model: 'zombie.glb', groups: { Groans: ['sounds/a.wav'], Attacks: ['sounds/b.wav'], Deaths: ['sounds/c.wav'] } } }))).toBe(`sound is over ${ZOMBIE_PACK_LIMITS.soundBytes} bytes`);
  expect(await reason(packZip({ model: new Uint8Array(ZOMBIE_PACK_LIMITS.modelBytes + 1) }))).toBe(`model is over ${ZOMBIE_PACK_LIMITS.modelBytes} bytes`);
  const members = Array.from({ length: ZOMBIE_PACK_LIMITS.members + 1 }, (_, i) => ({ name: `f${i}.txt`, data: 'x' }));
  expect(await reason(makeZip(members))).toBe(`more than ${ZOMBIE_PACK_LIMITS.members} members`);
  expect(CLIPS).toContain('death');
});

it('does not fetch, and the sources name no server path for the pack', () => {
  const dir = new URL('../../src/zombies/', import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith('.ts'));
  expect(files.length).toBeGreaterThan(5);
  for (const name of files) {
    const text = readFileSync(new URL(name, dir), 'utf8');
    expect(text, name).not.toContain('fetch(');
    expect(text, name).not.toContain('new Audio(');
    expect(text, name).not.toContain('__phoenix');
    expect(text, name).not.toContain('/__phoenix_zombies/');
  }
});

it('the mod table is the only way the page sees the pack path', () => {
  installModOverrides(null);
  expect(ZOMBIE_PACK_PATH).toBe('MODS/ZOMBIES/PACK.ZIP');
});

// The online seat's takeover (OT.R69), the 2026-10-20 review's asks 3 and 4.
const LISTED = { format: 's2u-zombies-pack', version: 1, model: 'zombie.glb', groups: { Groans: ['sounds/a.wav'], Attacks: ['sounds/b.wav'], Deaths: ['sounds/c.wav'] } };

it('inflates only the members pack.json lists: an unlisted member is never read (ask 4)', async () => {
  // a lying CRC on a member pack.json does not name: read, it would throw
  const pack = await readZombiePack(packZip({ extra: [{ name: 'junk.bin', data: 'x'.repeat(4096), crc: 1 }] }));
  expect(pack.groups['Groans']).toEqual(['sounds/a.wav']);
});

it('refuses a listed member over its cap from its declared size, before inflating it (ask 4)', async () => {
  // the central directory says the model is past its cap; its bytes are small -- refused as the model, not read
  const big = { name: 'big.glb', data: 'x', size: ZOMBIE_PACK_LIMITS.modelBytes + 1 };
  expect(await reason(packZip({ json: { ...LISTED, model: 'big.glb' }, extra: [big] }))).toBe(`model is over ${ZOMBIE_PACK_LIMITS.modelBytes} bytes`);
  const loud = { name: 'sounds/loud.wav', data: 'x', size: ZOMBIE_PACK_LIMITS.soundBytes + 1 };
  expect(await reason(packZip({ json: { ...LISTED, groups: { ...LISTED.groups, Groans: ['sounds/loud.wav'] } }, extra: [loud] }))).toBe(`sound is over ${ZOMBIE_PACK_LIMITS.soundBytes} bytes`);
  const fatManifest = makeZip([{ name: 'pack.json', data: '{}', size: ZOMBIE_PACK_LIMITS.manifestBytes + 1 }]);
  expect(await reason(fatManifest)).toBe(`pack.json is over ${ZOMBIE_PACK_LIMITS.manifestBytes} bytes`);
});

it('refuses a pack whose listed members total past the cap, before inflating any of them (ask 4)', async () => {
  expect(ZOMBIE_PACK_LIMITS.totalBytes).toBe(64 * 1024 * 1024);
  const small = { ...ZOMBIE_PACK_LIMITS, totalBytes: 100 };
  expect(await (async () => {
    try { await readZombiePack(goodPackBytes(), small); return ''; }
    catch (error) { return error instanceof ZombiePackRefusal ? error.message : String(error); }
  })()).toBe('the files pack.json lists are over 100 bytes');
  // a sound named twice counts once
  const twice = packZip({ json: { ...LISTED, groups: { ...LISTED.groups, Attacks: ['sounds/a.wav'] }, cues: { hit: 'sounds/a.wav' } } });
  // (the model, a.wav and c.wav: exactly their sum holds; counted twice, a.wav would pass it)
  const exact = glbWithClips(CLIPS).byteLength + 2 * pcmWav().length;
  expect((await readZombiePack(twice, { ...ZOMBIE_PACK_LIMITS, totalBytes: exact })).groups['Attacks']).toEqual(['sounds/a.wav']);
  // the bound is on the inflated sizes: a deflated member counts at what it inflates to
  const zeros = { name: 'sounds/z.wav', data: new Uint8Array(1 << 16) };
  expect(deflateRawSync(zeros.data).length).toBeLessThan(1 << 12);
  expect(await (async () => {
    try { await readZombiePack(packZip({ json: { ...LISTED, groups: { ...LISTED.groups, Groans: ['sounds/z.wav'] } }, extra: [zeros] }), { ...ZOMBIE_PACK_LIMITS, totalBytes: 1 << 16 }); return ''; }
    catch (error) { return error instanceof ZombiePackRefusal ? error.message : String(error); }
  })()).toBe(`the files pack.json lists are over ${1 << 16} bytes`);
});

it('refuses a model that names an address outside the file: only data: URIs (ask 3)', async () => {
  const outside = (field: 'buffers' | 'images', uri: string) => new Uint8Array(glbWithClips(CLIPS, 2, (json) => {
    if (field === 'buffers') (json['buffers'] as { uri?: string }[])[0]!.uri = uri;
    else json['images'] = [{ uri }];
  }));
  for (const uri of ['https://example.invalid/zombie.bin', '//example.invalid/z.bin', 'zombie.bin', 'blob:https://example.invalid/0']) {
    expect(await reason(packZip({ model: outside('buffers', uri) })), uri).toBe('model names an address outside the file');
    expect(await reason(packZip({ model: outside('images', uri) })), uri).toBe('model names an address outside the file');
  }
  expect(await reason(packZip({ model: outside('images', 'data:image/png;base64,AAAA') }))).toBe('');
});
