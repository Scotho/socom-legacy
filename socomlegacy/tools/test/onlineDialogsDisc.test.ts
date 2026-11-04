import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { discRoot } from '../dump-dialogs';
import { pinnedChapters, readChapters, readMpRooms } from '../dump-online-dialogs';

/**
 * ONL-33's dev-disc check (web research 128; W6.R8): the online chapter re-derived from the disc -- each online dialog's
 * widgets, bindings, own-set listings, the library animations its bindings reach, its edges, commands (with their row's
 * function), UI variables, valves, sounds and `UIMnLOC` ids, and `mp_rooms.rdr`'s table -- equal to
 * `onlineDialogs.pinned.json` (names, ids, counts and the scripts' ops as decoded; a literal caption as its length
 * only). Any change fails here: regenerate with `npx tsx tools/dump-online-dialogs.ts --pin` and say in research 128
 * what moved. The disc resolves through `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; with neither (CI) it skips.
 */
const DISC = discRoot();
const PIN = resolve(import.meta.dirname, 'onlineDialogs.pinned.json');

describe.skipIf(!DISC)('the online dialogs off the disc (SOCOM_DISC / SOCOM_PC_ROOT)', () => {
  it('equal the pin, key by key and chapter by chapter', () => {
    const pinned = JSON.parse(readFileSync(PIN, 'utf8'));
    const now = JSON.parse(JSON.stringify(pinnedChapters(readChapters(DISC!), readMpRooms(DISC!))));
    expect(Object.keys(now).sort()).toEqual(Object.keys(pinned).sort());
    for (const key of ['dialogs', 'pairs', 'mpRooms', 'library']) expect(now[key], key).toEqual(pinned[key]);
    expect(now.chapters.length).toBe(pinned.chapters.length);
    now.chapters.forEach((c: { name: string }, i: number) => expect(c, c.name).toEqual(pinned.chapters[i]));
  }, 300_000);

  it('the path\'s first screens: dlgMPswitch has no widget and one binding; LOGIN\'s lists both show NETCNF_DB', () => {
    const [sw, login] = readChapters(DISC!, ['dlgMPswitch.rdr', 'dlgNetLogin.rdr']);
    expect(sw!.widgets).toEqual([]);
    expect(sw!.animations).toEqual({ StopStreaming: ['VagStreaming(OFF)', 'SWITCHMENU(dlgNetLogin.rdr)'] });
    expect(login!.widgets.filter((w) => w.type === 'LISTBOX').map((w) => `${w.name} ${w.uivar}`)).toEqual(['COMBOLIST NETCNF_DB', 'HWLIST NETCNF_DB']);
    expect(login!.locs.filter((l) => l >= 572 && l <= 574)).toEqual([572, 573, 574]);
  }, 300_000);

  it('mp_rooms.rdr: 12 rooms of limit 256', () => {
    const rooms = readMpRooms(DISC!);
    expect(rooms.length).toBe(12);
    expect(rooms.every((r) => r.limit === 256)).toBe(true);
  }, 120_000);
});
