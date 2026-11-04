import { afterEach, describe, expect, it } from 'vitest';
import type { RangedAssetSource } from '../src/assetSource';
import {
  installMemberOverrides, looseMemberOverride, noteMemberArchive,
} from '../src/memberOverride';
import { readZdbMember, readZarMembers } from '../src/zarMembers';
import { Zar } from '../src/zar';
import { parseZdb, zdbMember } from '../src/zdb';

afterEach(() => { installMemberOverrides(null); });

function syntheticZdb(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const dataStart = 2048;
  const span = Math.max(2048, ...entries.map((entry) => entry.data.byteLength));
  const out = new Uint8Array(dataStart + span * entries.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0x98, entries.length, true);
  dv.setUint32(0x9c, 0x5c, true);
  entries.forEach((entry, i) => {
    const at = dataStart + i * span;
    const o = 0xa0 + i * 0x5c;
    dv.setUint32(o, 0x5c, true);
    for (let k = 0; k < entry.name.length; k++) out[o + 4 + k] = entry.name.charCodeAt(k);
    dv.setUint32(o + 68, at, true);
    dv.setUint32(o + 72, entry.data.byteLength, true);
    out.set(entry.data, at);
  });
  return out;
}

/** Root with two keys, the layout `zarMembers.test.ts` builds. */
function twoMembers(): Uint8Array {
  const names = ['a.bnk', 'b.bnk'];
  const stable = new TextEncoder().encode(names.join('\0') + '\0');
  const keys = [[0, 0, 0, 2], [0x1000, 0, 3, 0], [0x1000 + 6, 16, 2, 0]];
  const keysAt = 100 + stable.length;
  const dataAt = Math.ceil((keysAt + 16 * keys.length) / 16) * 16;
  const out = new Uint8Array(dataAt + 32);
  const dv = new DataView(out.buffer);
  dv.setUint32(4, keys.length, true);
  dv.setUint32(8, stable.length, true);
  dv.setUint32(12, 0x1000, true);
  dv.setUint32(16, 16, true);
  dv.setUint32(96, 0x20002, true);
  out.set(stable, 100);
  keys.forEach((k, i) => k.forEach((v, j) => dv.setInt32(keysAt + 16 * i + 4 * j, v, true)));
  out.set([1, 2, 3], dataAt);
  out.set([9, 8], dataAt + 16);
  return out;
}

function rangedOver(files: Record<string, Uint8Array>): RangedAssetSource & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    list: async () => Object.keys(files),
    read: async () => { throw new Error('a ranged read was expected'); },
    size: async (path) => {
      const bytes = files[path];
      if (!bytes) throw new Error(`miss ${path}`);
      return bytes.byteLength;
    },
    readRange: async (path, offset, length) => {
      asked.push(`${path}:${offset}+${length}`);
      const bytes = files[path];
      if (!bytes) throw new Error(`miss ${path}`);
      return bytes.slice(offset, offset + length);
    },
  };
}

describe('archive member overrides', () => {
  it('with nothing installed, a ZDB member is a view of the archive and a ZAR key is a view of its blob', () => {
    const zdb = syntheticZdb([{ name: 'RUN\\COMMON\\HUD_PAL.ZED', data: Uint8Array.of(4, 5, 6) }]);
    const member = zdbMember(zdb, parseZdb(zdb), 'HUD_PAL.ZED');
    expect(member.buffer).toBe(zdb.buffer);
    expect(Array.from(member)).toEqual([4, 5, 6]);
    const zarBytes = twoMembers();
    const zar = Zar.parse(zarBytes);
    const key = zar.data(zar.find('b.bnk')!);
    expect(key.buffer).toBe(zarBytes.buffer);
    expect(Array.from(key)).toEqual([9, 8]);
    expect(zar.keyCount).toBe(3);
  });

  it('replaces a ZDB member the map would read, including one named only by its file', () => {
    const zdb = syntheticZdb([{ name: 'RUN\\COMMON\\HUD_PAL.ZED', data: Uint8Array.of(4, 5, 6) }]);
    const mod = Uint8Array.of(7, 7, 7, 7);
    installMemberOverrides([{ archive: 'RUN/MP61.ZDB', member: 'HUD_PAL.ZED', bytes: mod }]);
    noteMemberArchive('run\\mp61.zdb', zdb);
    expect(zdbMember(zdb, parseZdb(zdb), 'hud_pal.zed')).toBe(mod);
    expect(Array.from(zdbMember(zdb, parseZdb(zdb), 'RUN\\COMMON\\HUD_PAL.ZED'))).toEqual([7, 7, 7, 7]);
  });

  it('adds a ZDB member the table does not hold, in memory only', () => {
    const zdb = syntheticZdb([{ name: 'RUN\\COMMON\\HUD_PAL.ZED', data: Uint8Array.of(1) }]);
    const mod = Uint8Array.of(9, 9);
    installMemberOverrides([{ archive: 'RUN/MP61.ZDB', member: 'NEW.ZAR', bytes: mod }]);
    noteMemberArchive('RUN/MP61.ZDB', zdb);
    const toc = parseZdb(zdb);
    expect(toc.map((entry) => entry.name)).toContain('NEW.ZAR');
    expect(zdbMember(zdb, toc, 'NEW.ZAR')).toBe(mod);
    expect(toc.find((entry) => entry.name === 'HUD_PAL.ZED' || entry.name.endsWith('HUD_PAL.ZED'))?.offset).toBeGreaterThan(0);
  });

  it('a ranged ZDB read returns the mod bytes and does not fetch that member\'s span', async () => {
    const zdb = syntheticZdb([{ name: 'RUN\\COMMON\\HUD_PAL.ZED', data: Uint8Array.of(4, 5, 6) }]);
    const mod = Uint8Array.of(3);
    installMemberOverrides([{ archive: 'RUN/MP61.ZDB', member: 'HUD_PAL.ZED', bytes: mod }]);
    const source = rangedOver({ 'RUN/MP61.ZDB': zdb });
    expect(await readZdbMember(source, 'RUN/MP61.ZDB', 'HUD_PAL.ZED')).toBe(mod);
    expect(source.asked.some((span) => span.endsWith('+3'))).toBe(false);
  });

  it('replaces one key of a ZAR, and adds a key the tree did not have', () => {
    const bytes = twoMembers();
    const replaced = Uint8Array.of(5, 5);
    const added = Uint8Array.of(6);
    installMemberOverrides([
      { archive: 'RUN/SOUNDS/BNKSTORE.ZAR', member: 'b.bnk', bytes: replaced },
      { archive: 'RUN/SOUNDS/BNKSTORE.ZAR', member: 'c.bnk', bytes: added },
    ]);
    noteMemberArchive('RUN/SOUNDS/BNKSTORE.ZAR', bytes);
    const zar = Zar.parse(bytes);
    expect(zar.keyCount).toBe(3);
    expect(zar.data(zar.find('b.bnk')!)).toBe(replaced);
    expect(zar.data(zar.find('a.bnk')!).buffer).toBe(bytes.buffer);
    expect(zar.data(zar.find('c.bnk')!)).toBe(added);
  });

  it('replaces a key inside a ZDB member, which a loose-file override cannot reach', () => {
    const inner = twoMembers();
    const zdb = syntheticZdb([{ name: 'RUN\\COMMON\\HUD_PAL.ZED', data: inner }]);
    const mod = Uint8Array.of(8, 8);
    installMemberOverrides([{ archive: 'RUN/MP61.ZDB', member: 'HUD_PAL.ZED!b.bnk', bytes: mod }]);
    noteMemberArchive('RUN/MP61.ZDB', zdb);
    const member = zdbMember(zdb, parseZdb(zdb), 'HUD_PAL.ZED');
    expect(member.buffer).toBe(zdb.buffer);
    const zar = Zar.parse(member);
    expect(zar.data(zar.find('b.bnk')!)).toBe(mod);
    expect(Array.from(zar.data(zar.find('a.bnk')!))).toEqual([1, 2, 3]);
  });

  it('a ranged ZAR read answers an override by name and still ranges a key with none', async () => {
    const bytes = twoMembers();
    const mod = Uint8Array.of(4);
    installMemberOverrides([{ archive: 'X.ZAR', member: 'b.bnk', bytes: mod }]);
    const source = rangedOver({ 'X.ZAR': bytes });
    const got = await readZarMembers(source, 'X.ZAR', ['a.bnk', 'b.bnk']);
    expect(got.get('b.bnk')).toBe(mod);
    expect(Array.from(got.get('a.bnk')!)).toEqual([1, 2, 3]);
    expect(looseMemberOverride('X.ZAR', 'b.bnk')).toBe(mod);
  });
});
