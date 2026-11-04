import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar } from '@s2u/archive';
import { ListboxWidget, ValveStore, dialogLookup, measureText, readTextFace, type DialogDesign, type UiDrawItem, type UiVarValue } from '@s2u/ui';
import { HAVE, WORLD, worldRig } from '../../ui/test/screens/worldOfSocomRig';
import { briefingRoomPingDesign, briefingRoomPingDraw, roomRowsWithPing, withBriefingRoomPing } from '../src/briefingRoomPing';
import { connectWorldOfSocom } from '../src/worldOfSocomHost';

const fixtureRoot = resolve(fileURLToPath(new URL('../../../test-fixtures/', import.meta.url)));
const read = (name: string): Uint8Array | null => {
  const candidates = [process.env.SOCOM_DISC, process.env.S2U_TEST_FIXTURES, fixtureRoot].filter((p): p is string => !!p);
  const path = candidates.map((p) => resolve(p, name)).find(existsSync);
  return path ? new Uint8Array(readFileSync(path)) : null;
};
const ui = read('RUN/UI/READERC.ZAR'), common = read('RUN/READERC.ZAR');
const lookup = ui ? dialogLookup([Zar.parse(ui)]) : () => null;
const fontArchive = common ? Zar.parse(common) : null;
const fontKey = fontArchive?.find('fonts.rdr');
const font = fontKey && fontArchive ? readTextFace(parseRdr(fontArchive.data(fontKey)), 'font_text_01') : null;
const roomList = (design: DialogDesign) => {
  const widget = design.controls.find((c) => c.name === 'ROOMLIST')!.widget;
  if (widget.type !== 'LISTBOX') throw new Error('native room list absent');
  return widget;
};
const glyphs = (items: UiDrawItem[]) => items.filter((x): x is Extract<UiDrawItem, { kind: 'glyphs' }> => x.kind === 'glyphs' && x.node === 'ROOMLIST');

describe.skipIf(!ui || !font || !HAVE)('MLS-PING browser adaptation on the decoded native briefing-room table', () => {
  it('places PING immediately left of PLAYERS with native fonts, bounds, bindings and every rank image intact', () => {
    const original = lookup(WORLD)!;
    const snapshot = JSON.stringify(original);
    const wrapped = withBriefingRoomPing(lookup), adapted = wrapped(WORLD)!;
    const before = roomList(original), after = roomList(adapted);
    expect(after.columns.map((c) => c.position)).toEqual([0, 170, 230, 300, 320, 340, 360]);
    expect(after.columns.map((c) => c.kind)).toEqual([1, 1, 1, 0, 0, 0, 0]);
    expect(after.columns.slice(3)).toEqual(before.columns.slice(2));
    expect({ ...after, columns: [] }).toEqual({ ...before, columns: [] });
    expect(adapted.font).toBe(original.font);
    const heading = (name: string) => adapted.objects.find((o) => o.name === name)!;
    const players = heading('NumberOfPlayers'), ping = heading('BriefingRoomPing'), ranks = heading('ElegibleRanks');
    expect(players.widget).toMatchObject({ type: 'TEXT', text: { caption: 'PLAYERS', scale: 1 } });
    expect(ping.widget).toMatchObject({ type: 'TEXT', text: { caption: 'PING', scale: 1 } });
    // As the child of NumberOfPlayers, the added heading follows all original SHOW/HIDE animations.
    expect([ping.childOf, players.x + ping.x, ping.y]).toEqual(['NumberOfPlayers', 358, 0]);
    expect(players.x + ping.x + measureText(font!, [...'PING'].map((c) => c.charCodeAt(0)), 1).width).toBeLessThan(players.x);
    expect(players.x + measureText(font!, [...'PLAYERS'].map((c) => c.charCodeAt(0)), 1).width).toBeLessThan(ranks.x);
    expect(ranks.x + measureText(font!, [...'ELIGIBLE RANKS'].map((c) => c.charCodeAt(0)), 1).width).toBeLessThan(624);
    expect(wrapped(WORLD)).toBe(adapted);
    expect(wrapped('dlgMPBriefingRoom.rdr')).toBe(lookup('dlgMPBriefingRoom.rdr'));
    expect(wrapped('missing.rdr')).toBeNull();
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('aligns drawn headings with their text cells and first medal through native BRIEFING ROOMS navigation', async () => {
    const entry = (lobbyName: string, playerCount: number, endOfList = false) => ({ status: 0, mediusWorldId: playerCount, playerCount, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList });
    let now = 0;
    const rig = worldRig({
      dialogs: withBriefingRoomPing, face: () => font, hasTexture: () => true,
      register: (host, { uiVars }) => {
        connectWorldOfSocom(host, {
          uiVars, valves: () => new ValveStore(), event: () => {}, ticket: () => 'T1', roomListPing: { now: () => now },
          roomList: { channelList: async () => { now += 12; return [entry('US CENTRAL', 7), entry('US WEST', 3, true)]; } },
        });
      },
    });
    await rig.settle(60);
    rig.press('CROSS', 10);
    for (let i = 0; i < 12 && rig.focused() !== 'briefingrooms'; i++) rig.press('DOWN', 6);
    expect(rig.focused()).toBe('briefingrooms');
    rig.press('CROSS', 6);
    const list = rig.parts.current!.widgets.get('ROOMLIST') as ListboxWidget;
    const drawn = briefingRoomPingDraw(rig.parts)(rig.m.shell()!.screen, rig.last());
    const names = ['BriefingRoomName', 'BriefingRoomPing', 'NumberOfPlayers', 'ElegibleRanks'];
    const text = drawn.filter((item): item is Extract<UiDrawItem, { kind: 'glyphs' }> => item.kind === 'glyphs');
    const headings = names.map((name) => text.find((item) => item.node === name)!);
    const start = (item: Extract<UiDrawItem, { kind: 'glyphs' }>) => item.quads.find((quad) => !quad.shadow)!.left;
    const body = glyphs(drawn);
    expect(body).toHaveLength(6);
    const cells = list.placed.cells.filter((cell) => cell.item === 0 && cell.kind === 'text');
    expect(cells).toHaveLength(3);
    // Compare actual font_text_01 glyphs, not design-record positions or a synthetic face's bearings.
    for (let column = 0; column < 3; column++) {
      expect(start(body[column]!)).toBe(cells[column]!.x);
      expect.soft(start(headings[column]!), `${names[column]} starts at its drawn row text`).toBe(start(body[column]!));
    }
    const medals = drawn.filter((item): item is Extract<UiDrawItem, { kind: 'sprite' }> => item.kind === 'sprite' && item.node === 'ROOMLIST' && item.texture?.startsWith('Medal_') === true);
    expect(medals).toHaveLength(8);
    expect(medals.map((item) => item.x0)).toEqual([488, 508, 528, 548, 488, 508, 528, 548]);
    expect(start(headings[3]!)).toBe(medals[0]!.x0);
    expect([...body.slice(0, 3).map(start), medals[0]!.x0]).toEqual([188, 358, 418, 488]);
    for (let column = 0; column < headings.length - 1; column++) {
      expect(Math.max(...headings[column]!.quads.map((quad) => quad.right))).toBeLessThan(start(headings[column + 1]!));
    }
    expect(Math.max(...headings[3]!.quads.map((quad) => quad.right))).toBeLessThan(624);
    expect(medals.every((item) => item.x1 <= 624)).toBe(true);
  });

  it.each(['A'.repeat(64), ' '.repeat(24) + 'A'.repeat(40)])('clips a long name without changing its full join input, native selection or adjacent cells (%s)', async (longName) => {
    const entry = (lobbyName: string, playerCount: number, endOfList = false) => ({ status: 0, mediusWorldId: playerCount, playerCount, maxPlayers: 64, securityLevel: 0, genericField1: 0, lobbyName, endOfList });
    let now = 0, fail = false;
    const rig = worldRig({
      dialogs: withBriefingRoomPing, face: () => font, hasTexture: () => true,
      register: (host, { uiVars }) => {
        connectWorldOfSocom(host, {
          uiVars, valves: () => new ValveStore(), event: () => {}, ticket: () => 'T1', roomListPing: { now: () => now },
          roomList: { channelList: async () => { if (fail) throw new Error('offline'); now += 12; return [entry(longName, 7), entry('Alpha', 3, true)]; } },
        });
      },
    });
    await rig.settle(60);
    rig.press('CROSS', 10);
    expect(rig.last().some((item) => 'node' in item && item.node === 'BriefingRoomPing')).toBe(false);
    for (let i = 0; i < 12 && rig.focused() !== 'briefingrooms'; i++) rig.press('DOWN', 6);
    expect(rig.focused()).toBe('briefingrooms');
    rig.press('CROSS', 6);
    const list = rig.parts.current!.widgets.get('ROOMLIST') as ListboxWidget;
    expect(list.items.map((r) => r.captions.slice(0, 3))).toEqual([['Alpha', '12', '3'], [longName, '12', '7']]);
    expect(list.items[1]!.images.slice(3).map((i) => i!.texture)).toEqual(['Medal_Blue.tif', 'Medal_Bronze.tif', 'Medal_Silver.tif', 'Medal_Gold.tif']);
    expect(list.placed.highlight!.h).toBe(20);
    const original = rig.last(), projected = briefingRoomPingDraw(rig.parts)(rig.m.shell()!.screen, original);
    const before = glyphs(original), after = glyphs(projected);
    expect(before).toHaveLength(6);
    expect(after).toHaveLength(6);
    for (const index of [0, 3]) {
      expect(after[index]!.clip).toMatchObject({ x0: 178, x1: 347, y1: 385 });
      expect(after[index]!.quads).toBe(before[index]!.quads); // existing scissor handles partial glyphs and UVs
    }
    expect(Math.max(...after[3]!.quads.map((q) => q.right))).toBeGreaterThan(358);
    for (const index of [1, 2, 4, 5]) expect(after[index]).toBe(before[index]);
    expect(projected.filter((i) => i.kind === 'sprite' && i.node === 'ROOMLIST')).toEqual(original.filter((i) => i.kind === 'sprite' && i.node === 'ROOMLIST'));
    expect(rig.last().some((item) => 'node' in item && item.node === 'BriefingRoomPing')).toBe(true);
    rig.press('DOWN', 8);
    expect(list.focus).toBe(1);
    fail = true;
    rig.host.dispatch({ anim: 'refresh_roomlist', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'RefreshRoomList', arg: 'NA', loc: 0, bytes: new Uint8Array(16) });
    await rig.settle(2);
    expect(list.focus).toBe(1);
    expect(list.items[1]!.captions.slice(0, 3)).toEqual([longName, '--', '7']);
    let selected: string | null = null;
    rig.host.setHandler('CanJoinRoom', (cmd) => { selected = rig.m.shell()!.inputString(cmd.anim); return false; });
    rig.press('CROSS', 8);
    expect(selected).toBe(longName);
  });
});

describe('room ping presentation remains optional', () => {
  it('keeps missing/non-native designs and non-array values intact', () => {
    const original = lookup('dlgMPBriefingRoom.rdr');
    if (original) expect(briefingRoomPingDesign(original)).toBe(original);
    expect(roomRowsWithPing([{ type: 'none' }], null)).toEqual([{ type: 'none' }]);
  });

  it('LATER 455 (OT.R84): each row its own number, looked up by the row\'s drawn name (its first value); unknown --', () => {
    const row = (name: string, players: number): UiVarValue => ({ type: 'array', value: [{ type: 'string', value: name }, { type: 'int', value: players }, { type: 'int', value: 1 }] });
    const ms: Record<string, number | null> = { Alpha: 31, Bravo: null };
    const out = roomRowsWithPing([row('Alpha', 3), row('Bravo', 7), row('Charlie', 1), { type: 'none' }], (name) => ms[name] ?? null);
    expect(out).toEqual([
      { type: 'array', value: [{ type: 'string', value: 'Alpha' }, { type: 'string', value: '31' }, { type: 'int', value: 3 }, { type: 'int', value: 1 }] },
      { type: 'array', value: [{ type: 'string', value: 'Bravo' }, { type: 'string', value: '--' }, { type: 'int', value: 7 }, { type: 'int', value: 1 }] },
      { type: 'array', value: [{ type: 'string', value: 'Charlie' }, { type: 'string', value: '--' }, { type: 'int', value: 1 }, { type: 'int', value: 1 }] },
      { type: 'none' },
    ]);
    // one number for every row, as before, when no per-room sample is known
    expect(roomRowsWithPing([row('Alpha', 3), row('Bravo', 7)], 12).map((r) => r.type === 'array' ? r.value[1] : null)).toEqual([{ type: 'string', value: '12' }, { type: 'string', value: '12' }]);
  });
});
