import { describe, expect, it } from 'vitest';
import type { Layout } from '../../src/forge/layout';
import { layoutOfRecord, readSaved, recordOfLayout } from '../../src/forge/record';
import { codeFromLocation, decodeShare, encodeShare, SHARE_CODE_MAX, SHARE_GUNZIP_MAX, SHARE_URL_MAX, shareLink, shareOffer } from '../../src/forge/share';

/**
 * FORGE: a layout shared as a code or a URL fragment, with no server. A browser adaptation with no original.
 */

const page = 'http://localhost:5310/forge?lobby=abc';

const v1: Layout = {
  forge: 1,
  base: { kind: 'blank', library: 'MP2' },
  pieces: [{ asset: 'MP2:crate', m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 20, 1] }],
  spawns: [{ team: 'A', p: [1, 0, 2], yaw: 0 }, { team: 'B', p: [3, 0, 4], yaw: 0 }],
};

describe('FORGE: a share code', () => {
  it('encodes a v3 record and decodes the same record, from a v1 layout and back', async () => {
    const record = readSaved(JSON.stringify(v1), 'Yard');
    const code = await encodeShare(record);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodeShare(code);
    expect(back).toEqual(record);
    expect(layoutOfRecord(back)).toEqual({ ...v1, name: 'Yard' });
    const offer = await shareOffer(page, record);
    expect(offer.kind).toBe('link');
    if (offer.kind !== 'link') return;
    expect(offer.url.startsWith('http://localhost:5310/forge#forge=')).toBe(true);
    expect(offer.url).not.toContain('lobby');
    expect(codeFromLocation(offer.url)).toBe(offer.code);
    expect(await decodeShare(codeFromLocation(offer.url)!)).toEqual(record);
    expect(layoutOfRecord(recordOfLayout(layoutOfRecord(back), 'Yard'))).toEqual(layoutOfRecord(back));
  });

  it('FCW-07a: a v2 code still decodes, as the same layout migrated to v3', async () => {
    const v2 = { v: 2, name: 'Yard', base: 'blank:MP2', assets: ['MP2:crate'], pieces: [[0, 10, 0, 20, 0]], spawns: [['A', 1, 0, 2, 0], ['B', 3, 0, 4, 0]] };
    const json = new TextEncoder().encode(JSON.stringify(v2));
    const stream = new Response(json).body!.pipeThrough(new CompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    const code = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const back = await decodeShare(code);
    expect(back).toEqual(readSaved(JSON.stringify(v1), 'Yard'));
    expect(back).toMatchObject({ schema: 'forge-layout', version: 3, ids: { pieces: ['p0'], spawns: ['s0', 's1'] } });
    // a v1 layout file is not a share code's content: only records are
    const fileJson = new TextEncoder().encode(JSON.stringify(v1));
    const fileBytes = new Uint8Array(await new Response(new Response(fileJson).body!.pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let fileBin = '';
    for (let i = 0; i < fileBytes.length; i++) fileBin += String.fromCharCode(fileBytes[i]!);
    await expect(decodeShare(btoa(fileBin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))).rejects.toThrow(/not a forge layout/);
  });

  it('FCW-07a: the 12,000-character link limit holds for a v3 record of the same content as a v2 one', async () => {
    // 300 pieces over four props, two spawns: the ids add a little to the gzipped code, never a truncation
    const assets = ['MP2:crate', 'MP2:barrel', 'MP2:a_dumpster', 'MP2:fence'];
    const big: Layout = {
      forge: 1, base: { kind: 'map', archive: 'MP2' },
      pieces: Array.from({ length: 300 }, (_, i) => ({ asset: assets[i % 4]!, m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, (i * 37) % 900, 0, (i * 53) % 700, 1] })),
      spawns: [{ team: 'A', p: [1, 0, 2], yaw: 0 }, { team: 'B', p: [3, 0, 4], yaw: 0 }],
    };
    const record = recordOfLayout(big, 'Big');
    const { schema: _s, version: _v, ids: _ids, ...rest } = record;
    const v2Json = new TextEncoder().encode(JSON.stringify({ v: 2, ...rest }));
    const v2Code = new Uint8Array(await new Response(new Response(v2Json).body!.pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const v3Code = await encodeShare(record);
    const v2Length = Math.ceil((v2Code.length * 4) / 3);
    expect(v3Code.length).toBeGreaterThan(v2Length);              // the ids cost something
    expect(v3Code.length).toBeLessThan(v2Length * 1.5);           // and not much: they are positional and compress
    const offer = await shareOffer(page, record);
    expect(offer.kind).toBe('link');
    if (offer.kind === 'link') expect(offer.url.length).toBeLessThanOrEqual(SHARE_URL_MAX);
    expect(await decodeShare(v3Code)).toEqual(record);
    // past the limit the offer is the file, never a cut link
    const huge: Layout = { ...big, pieces: Array.from({ length: 2000 }, (_, i) => ({ asset: `MP2:p${i % 200}`, m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, i * 7.3, i % 11, i * 3.1, 1] })) };
    expect((await shareOffer(page, recordOfLayout(huge, 'Huge'))).kind).toBe('too-big');
  });

  it('refuses a code that is not a layout, and a link that does not fit', async () => {
    await expect(decodeShare('$$$$')).rejects.toThrow(/share code/);
    await expect(decodeShare('AAAA')).rejects.toThrow(/share code|layout/);
    const record = recordOfLayout(v1, 'Yard');
    const offer = await shareOffer(page, record, 40);
    expect(offer.kind).toBe('too-big');
    expect(codeFromLocation('http://localhost:5310/forge')).toBeNull();
    expect(codeFromLocation('http://localhost:5310/forge#other=1')).toBeNull();
    expect(shareLink(page, 'abc')).toBe('http://localhost:5310/forge#forge=abc');
    expect(shareLink('http://localhost:5310/forge?devmode&lobby=abc&fly', 'abc')).toBe('http://localhost:5310/forge?devmode&fly#forge=abc');
    // the lobby link's path form (`/forge/lobby/<id>`): the share opens the layout, so the lobby leaves the path too
    expect(shareLink('http://localhost:5310/forge/lobby/abc?fly', 'c')).toBe('http://localhost:5310/forge?fly#forge=c');
    expect(shareLink('http://localhost:5310/s2u/forge/lobby/abc/', 'c')).toBe('http://localhost:5310/s2u/forge#forge=c');
    await expect(decodeShare('a'.repeat(SHARE_CODE_MAX + 1))).rejects.toThrow(/too long/);
    const payload = 'x'.repeat(SHARE_GUNZIP_MAX + 1);
    const stream = new Response(new TextEncoder().encode(payload)).body!.pipeThrough(new CompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    const fat = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await expect(decodeShare(fat)).rejects.toThrow(/too large/);
  });
});
