import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { LocService, loadLocService, MSG_NAME, type CaptionText, type LocEntry } from '../src/index';

/**
 * Which texts the locale service looks up (the sprint 6 close review, confirmed #2). The original refuses a text only
 * when it is empty or does not begin with '_' -- `FUN_003a3100` (D:L296945-296949) and each table's `FUN_003a41f0`
 * (D:L297546) -- and then compares the whole name with the tables' `MSG_ID`s. Nothing asks for a number after
 * the '_' or a `_MSG` ending, so `_60482_MAGS_MSG_sCount` (HudCLOC) and `_1065_MEDIUS_HW_MSG_sVendor_sProduct` (UIMnLOC)
 * resolve. A name no table holds is drawn as it stands (`FUN_003631f0` D:L260992-260993 keeps the text when the id is
 * not positive); a `_<n>_` name is still reported unresolved, with the id it spells.
 */

const entries = (ids: [number, string, string][]): LocEntry[] => ids.map(([id, msg, text]) => ({ id, msg, text }));

describe('LocService looks up every text that begins with an underscore', () => {
  const service = new LocService([
    { name: 'UIMn', entries: entries([[1065, '_1065_MEDIUS_HW_MSG_sVendor_sProduct', 'The hardware'], [7, '_NoNumber', 'n']]) },
    { name: 'HudC', entries: entries([[60482, '_60482_MAGS_MSG_sCount', 'mags']]) },
  ]);

  it('resolves a MSG_ID that does not end in _MSG, by caption and by the op-1 literal', () => {
    expect(service.caption('_60482_MAGS_MSG_sCount')).toEqual<CaptionText>({ kind: 'loc', id: 60482, table: 'HudC', text: 'mags' });
    expect(service.caption('_1065_MEDIUS_HW_MSG_sVendor_sProduct')).toEqual<CaptionText>({ kind: 'loc', id: 1065, table: 'UIMn', text: 'The hardware' });
    expect(service.command({ loc: 0, arg: '_60482_MAGS_MSG_sCount' })).toEqual<CaptionText>({ kind: 'loc', id: 60482, table: 'HudC', text: 'mags' });
  });

  it('resolves a MSG_ID with no number after the underscore', () => {
    expect(service.caption('_NoNumber')).toEqual<CaptionText>({ kind: 'loc', id: 7, table: 'UIMn', text: 'n' });
  });

  it('reports a missed _<n>_ name unresolved with its spelled id, and draws any other miss as it stands', () => {
    expect(service.caption('_60493_KILLED_WITH_MSG_sWeapon')).toEqual<CaptionText>({ kind: 'unresolved', id: 60493, ref: '_60493_KILLED_WITH_MSG_sWeapon' });
    expect(service.caption('_held')).toEqual<CaptionText>({ kind: 'literal', text: '_held' });
    expect(service.caption('NoUnderscore_MSG')).toEqual<CaptionText>({ kind: 'literal', text: 'NoUnderscore_MSG' });
  });
});

describe('MSG_NAME, the shape an inventory scans for (the close review, round 1, note 4)', () => {
  it('takes a _<n>_..._MSG name and the four with a suffix after _MSG, with the id they spell', () => {
    for (const [name, id] of [['_15_ARMORY_MSG', 15], ['_273_5Minutes_MSG', 273], ['_60482_MAGS_MSG_sCount', 60482],
      ['_1065_MEDIUS_HW_MSG_sVendor_sProduct', 1065], ['_60493_KILLED_WITH_MSG_sWeapon', 60493]] as const) {
      expect(MSG_NAME.exec(name)?.[1], name).toBe(String(id));
    }
  });

  it('leaves out a literal, a name with no id and one with no _MSG', () => {
    for (const name of ['ARMORY', '_held', '_NoNumber', 'NoUnderscore_MSG', '_15_ARMORY', '_15_ARMORY_MSGX']) {
      expect(MSG_NAME.test(name), name).toBe(false);
    }
  });
});

const DISC = process.env.SOCOM_DISC;
const HAVE_DISC = !!DISC && existsSync(resolve(DISC, 'RUN/LOCALE/STATES'));

describe.skipIf(!HAVE_DISC)('every MSG_ID of the five front-end tables round-trips through caption() (SOCOM_DISC)', () => {
  it('resolves each name to its own id, the four names outside /^_\\d+_.*_MSG$/ among them', async () => {
    const { service, missing } = await loadLocService(new FsAssetSource(resolve(DISC ?? '')), 'RUN/MP2.ZDB');
    expect(missing).toEqual([]);
    const outside: string[] = [];
    for (const [table, list] of service.tables) for (const e of list) {
      expect(service.caption(e.msg), e.msg).toEqual<CaptionText>({ kind: 'loc', id: e.id, table, text: e.text });
      if (!/^_\d+_.*_MSG$/.test(e.msg)) outside.push(`${table} ${e.id}`);
      expect(MSG_NAME.exec(e.msg)?.[1], e.msg).toBe(/^_(\d+)_/.exec(e.msg)?.[1]); // every one is in the scan
    }
    expect(outside).toEqual(['UIMn 1065', 'HudC 60482', 'HudC 60493', 'HudC 60494']);
  });
});
