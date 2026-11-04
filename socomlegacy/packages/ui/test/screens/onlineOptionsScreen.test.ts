import { describe, expect, it } from 'vitest';
import { RadioStripWidget } from '../../src/widgets/radioStrip';
import { ONLINE_OPTIONS, ONLINE_OPTIONS_PARKED_ROWS, PARKED_ROWS, parkedControlGate, parkedRowGate } from '../../src/screens/worldOfSocomCommands';
import { OnlineOptionsCommands, PLAYER_DESCRIPTION_VAR, recordDescription, type OwnerFieldsService, type PlayerInfoLookup } from '../../src/screens/onlineOptionsCommands';
import { UiVarManager } from '../../src/uiVars';
import { VALVE_TYPE } from '../../src/valves';
import { HAVE, worldRig } from './worldOfSocomRig';

/**
 * ONLINE OPTIONS (`dlgOnlineOptions.rdr`) over the machine, built from the disc's layout and scripts (the world rig):
 * every row runs since OPT-15 (web research 265 §1, 2026-10-10) -- SETUP TAUNTS and the save unparked with the taunts
 * (web research 301 §6), SETUP MESSAGING with Chris's settings (web research 302 §3), both 2026-10-07; PLAYER
 * DESCRIPTION (the soft keyboard on `PlayerDescription`, 63 characters / 65 bytes, then `SetPlayerDescription`
 * `FUN_00277640` to the owner-fields operation), INPUT FILTERS (`dlgOnlineFilters.rdr`, ONL-15's page), and the TEAMMATE
 * NAMES and EXTERNAL WHISPERS strips (`DISPLAY_MP_TEAM_NAMES`, `EnableExternalWhispers`: the disc's scripts write them,
 * research 229 §3) with OPT-15. The files come from the disc or the committed fixtures.
 */

const SETTLED = 60;
type Rig = ReturnType<typeof worldRig>;
/** The owner-fields operation as a fake: each call logged, answered with the text cut to the 0x40 bytes the server keeps (or never). */
function owner(answer = true): OwnerFieldsService & { sent: string[] } {
  const sent: string[] = [];
  return { sent, setDescription: (description) => { sent.push(description); return answer ? Promise.resolve({ description: description.slice(0, 0x40) }) : new Promise(() => {}); } };
}
async function options(o: { service?: OwnerFieldsService; valves?: Record<string, number> } = {}): Promise<Rig> {
  const r = worldRig({
    start: ONLINE_OPTIONS, name: 'socomc', keyboard: true,
    register: (host, ctx) => { new OnlineOptionsCommands({ uiVars: ctx.uiVars, service: o.service }).register(host); },
  });
  for (const [name, value] of Object.entries(o.valves ?? {})) r.m.valves.set(name, value, VALVE_TYPE.PERSIST);
  await r.settle(SETTLED);
  expect(r.current()).toBe(ONLINE_OPTIONS);
  return r;
}
/** Down the ring onto the `nth` control named `name` (two rows are named Messaging: SETUP MESSAGING, then SETUP TAUNTS). */
function go(r: Rig, name: string, nth = 0): void {
  for (let i = 0, seen = -1; i < 16; i++) {
    if (r.focused() === name && ++seen === nth) return;
    r.press('DOWN', 6);
  }
  expect(r.focused()).toBe(name);
}
const strip = (r: Rig, name: string): RadioStripWidget => r.parts.current!.widgets.get(name) as unknown as RadioStripWidget;
const str = (uiVars: UiVarManager, name: string): string | null => { const v = uiVars.find(name)?.value; return v?.type === 'string' ? v.value : null; };
const flush = async (): Promise<void> => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

describe('the gates: ONLINE OPTIONS has no parked row since OPT-15 (OT.R8 retired here, web research 265 §1)', () => {
  const at = (animation: string, argument: string | null = null, dialog = ONLINE_OPTIONS) => ({ dialog, animation, argument });
  it('every row\'s CROSS runs and every strip takes the pad; SOCOM II ONLINE has none either since ONL-30 (W18.R13)', () => {
    expect(ONLINE_OPTIONS_PARKED_ROWS).toEqual([]);
    for (const [a, arg] of [['SetPlayerDescription', null], ['goto_menu', 'dlgOnlineFilters.rdr'], ['goto_menu', 'dlgSetSOP.rdr'], ['goto_menu', 'dlgSetTaunts.rdr'], ['ForceSave', null], ['check_then_save_and_leave', null], ['OnOptionsBack', null], ['save_and_leave', null]] as const) {
      expect(parkedRowGate(at(a, arg)), `${a} ${arg}`).toBe(false);
    }
    for (const control of ['TeamMateNames', 'ExternalWhispers', 'Messaging']) expect(parkedControlGate({ dialog: ONLINE_OPTIONS, control }), control).toBe(false);
    // Was: CLAN RANKING's Goto_ClanLadder taken on SOCOM II ONLINE, parked until ONL-30 (W18.R13, H188); its merge
    // (406e46fd9) emptied PARKED_ROWS. The gate is kept for a later parked row (PARKED_ROW_GATE_READING), taking nothing.
    expect(PARKED_ROWS).toEqual([]);
    expect(parkedRowGate(at('Goto_ClanLadder', null, 'dlgWorldOfSOCOM.rdr'))).toBe(false);
  });
});

describe('SetPlayerDescription (FUN_00277640) as a row (web research 265 §1)', () => {
  it('sends the PlayerDescription variable\'s text and sets the variable to the stored text the operation answers; answers 1', async () => {
    const uiVars = new UiVarManager();
    const service = owner();
    uiVars.set(uiVars.add(PLAYER_DESCRIPTION_VAR, null, 1), { type: 'string', value: 'x'.repeat(70) });
    expect(new OnlineOptionsCommands({ uiVars, service }).SetPlayerDescription({} as never, {} as never, undefined)).toBe(true);
    await flush();
    expect(service.sent).toEqual(['x'.repeat(70)]);
    expect(str(uiVars, PLAYER_DESCRIPTION_VAR)).toBe('x'.repeat(64));
  });

  it('no string variable sends nothing (the type-3 test, D:L122941); with no service, or no answer, the typed text stays', async () => {
    const uiVars = new UiVarManager();
    const service = owner(false);
    new OnlineOptionsCommands({ uiVars, service }).SetPlayerDescription({} as never, {} as never, undefined);
    expect(service.sent).toEqual([]);
    uiVars.set(uiVars.add(PLAYER_DESCRIPTION_VAR, null, 1), { type: 'string', value: 'typed' });
    expect(new OnlineOptionsCommands({ uiVars }).SetPlayerDescription({} as never, {} as never, undefined)).toBe(true);
    new OnlineOptionsCommands({ uiVars, service }).SetPlayerDescription({} as never, {} as never, undefined);
    await flush();
    expect([service.sent, str(uiVars, PLAYER_DESCRIPTION_VAR)]).toEqual([['typed'], 'typed']);
  });
});

/** A 256-byte record (hex) as the services' PlayerInfo answers it: `'E'`, the description at +0x9f (the codec's string rule). */
function recordHex(description: string, version = 0x45): string {
  const b = new Uint8Array(256);
  b[0] = version;
  b[4] = 0xe8; b[5] = 0x03;                       // the rating 1000
  for (let i = 0; i < description.length && i < 66; i++) b[0x9f + i] = description.charCodeAt(i);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
/** PlayerInfo as a fake: each name asked logged, answered with the status and the record given (or never). */
function lookup(status: number, stats: string, answer = true): PlayerInfoLookup & { asked: string[] } {
  const asked: string[] = [];
  return { asked, playerInfo: (q) => { asked.push(q.name); return answer ? Promise.resolve({ status, stats }) : new Promise(() => {}); } };
}

describe('SVC-15a: the own-stats read at the login sets PlayerDescription from the record\'s +0x9f (FUN_002fa8f0 D:L198401-198402; research 268 §1.7)', () => {
  it('asks the session\'s own PlayerInfo by its name; on Success the variable is added and set to the stored description', async () => {
    const uiVars = new UiVarManager();
    const info = lookup(0, recordHex('hard to find'));
    new OnlineOptionsCommands({ uiVars, playerInfo: info, accountName: () => 'Alfa One' }).readOwnRecord();
    await flush();
    expect([info.asked, str(uiVars, PLAYER_DESCRIPTION_VAR)]).toEqual([['Alfa One'], 'hard to find']);
  });

  it('a description filling the 66-byte field reads to its end; a record that is not E is the default\'s empty text (FUN_002f9ac0 D:L198207-198222)', () => {
    expect(recordDescription(recordHex('d'.repeat(66)))).toBe('d'.repeat(66));
    expect(recordDescription(recordHex('abc', 0x00))).toBe('');
    expect(recordDescription('')).toBe('');
    expect(recordDescription('zz'.repeat(256))).toBe('');
  });

  it('then TRIANGLE\'s discard has the stored text to restore: the variable holds it before the dialog opens (research 265 §6)', async () => {
    const uiVars = new UiVarManager();
    new OnlineOptionsCommands({ uiVars, playerInfo: lookup(0, recordHex('abc')), accountName: () => 'Alfa One' }).readOwnRecord();
    await flush();
    expect(str(uiVars, PLAYER_DESCRIPTION_VAR)).toBe('abc');
  });

  it('another status (D:L198381: Success only), no answer, no service or no login: the variable is left as it is', async () => {
    for (const o of [
      { playerInfo: lookup(1, recordHex('x')), accountName: () => 'Alfa One' },
      { playerInfo: lookup(0, recordHex('x'), false), accountName: () => 'Alfa One' },
      { accountName: () => 'Alfa One' },
      { playerInfo: lookup(0, recordHex('x')), accountName: () => null },
    ]) {
      const uiVars = new UiVarManager();
      new OnlineOptionsCommands({ uiVars, ...o }).readOwnRecord();
      await flush();
      expect(uiVars.find(PLAYER_DESCRIPTION_VAR)).toBeUndefined();
    }
  });

  it('a reply that lands after another login (the session\'s ticket changed) changes nothing: A\'s text never reaches B\'s variable', async () => {
    let answer: (r: { status: number; stats: string }) => void = () => {};
    const playerInfo: PlayerInfoLookup = { playerInfo: () => new Promise((ok) => { answer = ok; }) };
    let ticket: string | null = 'ticket-A';
    let name = 'Alfa One';
    const uiVars = new UiVarManager();
    new OnlineOptionsCommands({ uiVars, playerInfo, accountName: () => name, session: () => ticket }).readOwnRecord();
    ticket = 'ticket-B';
    name = 'Bravo One';
    answer({ status: 0, stats: recordHex('alfa text') });
    await flush();
    expect(uiVars.find(PLAYER_DESCRIPTION_VAR)).toBeUndefined();
    // The same session's reply is taken.
    new OnlineOptionsCommands({ uiVars, playerInfo, accountName: () => name, session: () => ticket }).readOwnRecord();
    answer({ status: 0, stats: recordHex('bravo text') });
    await flush();
    expect(str(uiVars, PLAYER_DESCRIPTION_VAR)).toBe('bravo text');
  });
});

describe.skipIf(!HAVE)(`ONLINE OPTIONS over the machine${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  it('PLAYER DESCRIPTION: CROSS sounds .DINK and opens the keyboard on PlayerDescription (PlayerChatSkb, 63 characters / 65 bytes); ENTER runs OnSKBApply: the kept text (at most 63) to the operation, DescChanged 1', async () => {
    const service = owner();
    const r = await options({ service });
    go(r, 'playerdesc');
    const sounds = r.sound.log.length;
    r.press('CROSS', 6);
    expect(r.sound.log.slice(sounds).some((l) => l.includes('.DINK'))).toBe(true);
    expect(r.skb!.keyboard.isOpen).toBe(true);
    expect(r.skb!.keyboard.request).toMatchObject({ uiVar: 'PlayerDescription', skbName: 'PlayerChatSkb', maxChars: 63, maxBytes: 65 });
    // 70 characters: the keyboard keeps at most 63 (the caps), fewer where the edit's one line is full first (the fit,
    // SKB_FIT_READING, at the rig's fixture face's widths); what it keeps is what the row sends.
    const long = 'abcdefghij'.repeat(7);
    r.type(long);
    await r.settle(SETTLED);
    expect(r.skb!.keyboard.isOpen).toBe(false);
    const kept = service.sent[0] ?? '';
    expect([service.sent.length, kept.length > 0 && kept.length <= 63, long.startsWith(kept)]).toEqual([1, true, true]);
    expect(str(r.uiVars, 'PlayerDescription')).toBe(kept);
    expect(r.valve('DescChanged')).toBe(1);
    expect(r.current()).toBe(ONLINE_OPTIONS);
  });

  it('INPUT FILTERS opens dlgOnlineFilters.rdr (ONL-15\'s page)', async () => {
    const r = await options();
    go(r, 'filters');
    r.press('CROSS', 4);
    await r.settle(SETTLED);
    expect(r.builds.at(-1)).toBe('dlgOnlineFilters.rdr');
  });

  it('TEAMMATE NAMES: the strip starts at the valve (ON 0, OFF 1); RIGHT / LEFT write DISPLAY_MP_TEAM_NAMES 0 / 1, DISPTEAM_NAMES and OptionsMenuChanged 1', async () => {
    const r = await options({ valves: { DISPLAY_MP_TEAM_NAMES: 1 } });
    expect(strip(r, 'TeamMateNames').selection).toBe(0);
    go(r, 'TeamMateNames');
    r.press('RIGHT', 6);
    expect([strip(r, 'TeamMateNames').selection, r.valve('DISPLAY_MP_TEAM_NAMES'), r.valve('DISPTEAM_NAMES'), r.valve('OptionsMenuChanged')]).toEqual([1, 0, 1, 1]);
    r.press('LEFT', 6);
    expect([strip(r, 'TeamMateNames').selection, r.valve('DISPLAY_MP_TEAM_NAMES')]).toEqual([0, 1]);
    const off = await options({ valves: { DISPLAY_MP_TEAM_NAMES: 0 } });
    expect(strip(off, 'TeamMateNames').selection).toBe(1);
  });

  it('EXTERNAL WHISPERS: the strip starts at EnableExternalWhispers (ON 0, OFF 1); RIGHT / LEFT write it 0 / 1 and OptionsMenuChanged 1, DISPLAY_MP_TEAM_NAMES untouched', async () => {
    const r = await options({ valves: { EnableExternalWhispers: 1, DISPLAY_MP_TEAM_NAMES: 1 } });
    expect(strip(r, 'ExternalWhispers').selection).toBe(0);
    go(r, 'ExternalWhispers');
    r.press('RIGHT', 6);
    expect([strip(r, 'ExternalWhispers').selection, r.valve('EnableExternalWhispers'), r.valve('OptionsMenuChanged'), r.valve('DISPLAY_MP_TEAM_NAMES')]).toEqual([1, 0, 1, 1]);
    r.press('LEFT', 6);
    expect([strip(r, 'ExternalWhispers').selection, r.valve('EnableExternalWhispers')]).toEqual([0, 1]);
    const off = await options({ valves: { EnableExternalWhispers: 0 } });
    expect(strip(off, 'ExternalWhispers').selection).toBe(1);
  });

  it('SETUP MESSAGING (the first Messaging row) opens dlgSetSOP.rdr (web research 302 §3)', async () => {
    const r = await options();
    go(r, 'Messaging', 0);
    r.press('CROSS', 4);
    await r.settle(SETTLED);
    expect(r.builds.at(-1)).toBe('dlgSetSOP.rdr');
  });

  it('SETUP TAUNTS (the second Messaging row) opens dlgSetTaunts.rdr', async () => {
    const r = await options();
    go(r, 'Messaging', 1);
    r.press('CROSS', 4);
    await r.settle(SETTLED);
    expect(r.builds.at(-1)).toBe('dlgSetTaunts.rdr');
  });

  it('RETURN with a change (do_chat\'s OptionsMenuChanged = 1) runs check_then_save_and_leave into save_and_leave: the #831 save prompt; with none it leaves for SOCOM II ONLINE', async () => {
    const r = await options();
    r.m.valves.set('OptionsMenuChanged', 1, VALVE_TYPE.PERM);
    go(r, 'return');
    const from = r.outcomes.length;
    r.press('CROSS', 4);
    await r.settle(SETTLED);
    expect(r.calls(ONLINE_OPTIONS, from).some((c) => c.startsWith('StoreOptions'))).toBe(true);   // save_and_leave's first line
    expect(r.shown()).toBe(true);                                                                    // #831: save to the memory card?
    const q = await options();
    q.m.valves.set('OptionsMenuChanged', 0, VALVE_TYPE.PERM);
    go(q, 'return');
    q.press('CROSS', 4);
    await q.settle(SETTLED);
    expect(q.builds.at(-1)).toBe('dlgWorldOfSOCOM.rdr');
  });
});
