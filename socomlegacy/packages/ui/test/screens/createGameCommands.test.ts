import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '../../src/dialog';
import { UiVarManager } from '../../src/uiVars';
import { ValveStore, VALVE_TYPE } from '../../src/valves';
import { conditionTokens, type ZAnimRtSet, type ZAnimUiCommand } from '../../src/zanimRuntime';
import {
  CREATE_GAME_ENTRY_COMMANDS, CreateGameCommands, FIRST_RELEASE_MAPS, availableMissionRows, clanField, missionRecords, playListNumbers, playListSets,
  type CreateGameReply, type CreateGameRequest, type CreatedGame,
} from '../../src/screens/createGameCommands';
import { LOGOFF_COMMAND_ROWS } from '../../src/screens/logoffCommands';
import { discAnimSets, discMissions, HAVE } from './createGameRig';

/**
 * ONL-13 and ONL-14's rows off the machine (web research 163 §2-§4, 164 §2): `missionlist.rdr` as `FUN_002c9540`
 * reads it, `FUN_00274940`'s rows filtered to the first release's maps, CreateGame1's fields (`FUN_002edda0`), GF3
 * (`FUN_002e99f0`), `CreateMPGame`'s checks (`FUN_002f9410`) and cbCreateGame's events (`FUN_002ee090`).
 */
const cmd = (fn: string, arg = 'NA', anim = 'create_game'): ZAnimUiCommand => ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(16) });
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const S = (value: string) => ({ type: 'string' as const, value });

function rows(o: { reply?: CreateGameReply | null; room?: number; up?: boolean; clanId?: number; respawnRules?: boolean } = {}) {
  const uiVars = new UiVarManager(), valves = new ValveStore();
  const events: number[] = [], ran: string[] = [], sent: CreateGameRequest[] = [], created: CreatedGame[] = [];
  const pending: ((r: CreateGameReply) => void)[] = [];
  const c = new CreateGameCommands({
    uiVars, valves: () => valves, event: (k) => { events.push(k); }, row: (fn, arg) => { ran.push(`${fn}(${arg})`); },
    respawnRules: o.respawnRules,
    roomWorldId: () => o.room ?? 3, lobbyUp: () => o.up ?? true, created: (g) => { created.push(g); }, ...(o.clanId === undefined ? {} : { clanId: () => o.clanId! }),
    service: { createGame: (q) => { sent.push(q); return o.reply === null ? new Promise((res) => { pending.push(res); }) : Promise.resolve(o.reply ?? { status: 0, mediusWorldId: 9 }); } },
  });
  uiVars.set(uiVars.add('GAMENAMEVAR', null, 2), S('test'));
  uiVars.set(uiVars.add('MEDIUS_LOBBY_NAME', null, 2), S('Bravo'));
  for (const [n, v] of [['MaxPlayersValve', 16], ['MaxSpectatorsValve', 8], ['PasswordValve', 0], ['CreateClanAffiliation', 0]] as const) valves.set(n, v, VALVE_TYPE.TEMP);
  return { c, uiVars, valves, events, ran, sent, created, pending };
}

describe('the entry list (CREATE_GAME_ENTRY_COMMANDS)', () => {
  it("ONL-22 (research 315 §6 E5): LobbyBailout, OnMultiplayerDisconnect's first row, is the logoff module's body (row 84, FUN_0027dc90), not parked", () => {
    expect(CREATE_GAME_ENTRY_COMMANDS.find((e) => e.name === 'LobbyBailout')).toMatchObject({ state: 'existing', task: 'ONL-22' });
    expect(LOGOFF_COMMAND_ROWS.find((r) => r.name === 'LobbyBailout')).toMatchObject({ id: 84, fn: 0x27dc90, task: 'ONL-22' });
  });
});

describe('missionlist.rdr and the PLAY LIST\'s rows (FUN_002c9540, FUN_00274940)', () => {
  it.skipIf(!HAVE)('the disc\'s 22 multiplayer missions in their order, each with its type', () => {
    const m = discMissions();
    expect(m.length).toBe(22);
    expect(m.slice(0, 3)).toEqual([
      { number: 51, name: 'VIGILANCE', type: 5, multiplayer: true }, { number: 52, name: 'THE MIXER', type: 3, multiplayer: true },
      { number: 53, name: 'FOXHUNT', type: 3, multiplayer: true },
    ]);
    expect(m.filter((x) => (FIRST_RELEASE_MAPS as readonly number[]).includes(x.number)).map((x) => x.name)).toEqual([
      'VIGILANCE', 'FISH HOOK', 'CROSSROADS', 'BLIZZARD', 'FROSTFIRE', 'DESERT GLORY', 'NIGHT STALKER', 'THE RUINS',
    ]);
  });

  // DF-14 (DF.R1, DF.R2; OT.R58 amended a second time 2026-11-08): FISH HOOK (MP71) and DESERT GLORY (MP6) offered,
  // EXTRACTION both -- missionlist.rdr's TYPE 4 off the disc (`FUN_002c9540` D:L168877-168906; research 192 G2: EXT 6,
  // 10, 11, 71), the 7th and the 16th of its 22 multiplayer records (research 164 §7's order).
  it.skipIf(!HAVE)('DF-14: MP71 FISH HOOK and MP6 DESERT GLORY are the disc\'s 7th and 16th multiplayer missions, each TYPE 4 (EXTRACTION)', () => {
    const m = discMissions();
    expect(m.findIndex((x) => x.number === 71)).toBe(6);
    expect(m.findIndex((x) => x.number === 6)).toBe(15);
    expect(m.filter((x) => x.number === 6 || x.number === 71)).toEqual([
      { number: 71, name: 'FISH HOOK', type: 4, multiplayer: true }, { number: 6, name: 'DESERT GLORY', type: 4, multiplayer: true },
    ]);
  });

  // V13-2, V13-3 (V13.R1, V13.R2; OT.R58 amended 2026-11-07): BLIZZARD (MP1) and THE RUINS (MP12) offered, DEMOLITION both --
  // missionlist.rdr's TYPE 2 off the disc (`FUN_002c9540`; `viewer/test/rules.test.ts` reads DEMOLITION as 1 7 9 12 72 83),
  // the 13th and the 22nd of its 22 multiplayer records (research 192 G16's order).
  it.skipIf(!HAVE)('V13-2: MP1 BLIZZARD and MP12 THE RUINS are the disc\'s 13th and 22nd multiplayer missions, each TYPE 2 (DEMOLITION)', () => {
    const m = discMissions();
    expect(m.findIndex((x) => x.number === 1)).toBe(12);
    expect(m.findIndex((x) => x.number === 12)).toBe(21);
    expect(m.filter((x) => x.number === 1 || x.number === 12)).toEqual([
      { number: 1, name: 'BLIZZARD', type: 2, multiplayer: true }, { number: 12, name: 'THE RUINS', type: 2, multiplayer: true },
    ]);
  });

  it.skipIf(!HAVE)('V13-2, DF-14 (DF.R2): with RESPAWN on the disc\'s list is SUPPRESSION\'s alone -- BLIZZARD and THE RUINS (DEMOLITION), DESERT GLORY and FISH HOOK (EXTRACTION) left out at the source, as CROSSROADS and NIGHT STALKER (FUN_00274940 D:L121528-121530)', () => {
    expect(playListNumbers({ type: 'array', value: availableMissionRows(discMissions(), { respawn: true }) })).toEqual([51, 2]);
  });

  it('a record with no NUMBER or no NAME is not a mission; TYPE outside the five is 0; MULTIPLAYER by its key', () => {
    expect(missionRecords([[['NAME', ['X'], 'NUMBER', ['9'], 'TYPE', ['CTF']], ['NAME', ['Y']], ['NUMBER', ['3'], 'NAME', ['Z'], 'MULTIPLAYER', []]]] as never))
      .toEqual([{ number: 9, name: 'X', type: 0, multiplayer: false }, { number: 3, name: 'Z', type: 0, multiplayer: true }]);
  });

  const missions = [
    { number: 51, name: 'VIGILANCE', type: 5, multiplayer: true }, { number: 52, name: 'THE MIXER', type: 3, multiplayer: true },
    { number: 71, name: 'FISH HOOK', type: 4, multiplayer: true }, { number: 72, name: 'CROSSROADS', type: 2, multiplayer: true }, { number: 1, name: 'BLIZZARD', type: 2, multiplayer: true },
    { number: 2, name: 'FROSTFIRE', type: 5, multiplayer: true },
    { number: 6, name: 'DESERT GLORY', type: 4, multiplayer: true }, { number: 7, name: 'NIGHT STALKER', type: 2, multiplayer: true },
    { number: 12, name: 'THE RUINS', type: 2, multiplayer: true },
    { number: 99, name: 'SINGLE', type: 0, multiplayer: false },
  ];

  it('respawn off: only the offered maps, plain [number, name] rows in missionlist.rdr order; no Medley, no Random (OT.R16, OT.R45, OT.R58 amended: the owner\'s eight-map list)', () => {
    const plain = (n: number, name: string) => ({ type: 'array', value: [{ type: 'int', value: n }, S(name)] });
    expect(availableMissionRows(missions, { respawn: false })).toEqual([
      plain(51, 'VIGILANCE'), plain(71, 'FISH HOOK'), plain(72, 'CROSSROADS'), plain(1, 'BLIZZARD'), plain(2, 'FROSTFIRE'),
      plain(6, 'DESERT GLORY'), plain(7, 'NIGHT STALKER'), plain(12, 'THE RUINS'),
    ]);
  });

  it.skipIf(!HAVE)('the disc\'s list: VIGILANCE, FISH HOOK, CROSSROADS, BLIZZARD, FROSTFIRE, DESERT GLORY, NIGHT STALKER, THE RUINS -- the 22 multiplayer missions left out at the source but the eight (OT.R45; V13-2, V13-3, DF-14)', () => {
    expect(playListNumbers({ type: 'array', value: availableMissionRows(discMissions(), { respawn: false }) })).toEqual([51, 71, 72, 1, 2, 6, 7, 12]);
  });

  it('every map offered (the owner opening the rest): Medley and Random first, then every multiplayer mission, as FUN_00274940 lists them', () => {
    expect(playListNumbers({ type: 'array', value: availableMissionRows(missions, { respawn: false, offered: () => true }) })).toEqual([254, 255, 51, 52, 71, 72, 1, 2, 6, 7, 12]);
  });

  it('respawn on: no Medley or Random, SUPPRESSION missions only (the default path keeps RESPAWN unselectable)', () => {
    expect(playListNumbers({ type: 'array', value: availableMissionRows(missions, { respawn: true }) })).toEqual([51, 2]);
  });

  it('a mission whose archive is not present is not listed (FUN_002c94f0)', () => {
    expect(playListNumbers({ type: 'array', value: availableMissionRows(missions, { respawn: false, present: (n) => n !== 72 }) })).toEqual([51, 71, 1, 2, 6, 7, 12]);
  });
});

describe('add_a_mission\'s Medley test with no Medley row (PLAY_LIST_NO_MEDLEY_ROW_READING)', () => {
  const addAMission = (sets: readonly ZAnimRtSet[]) => sets.find((x) => x.name.toLowerCase() === 'dlgcreategame.rdr')!.anims.find((a) => a.name === 'add_a_mission')!;
  /** The IF's tokens as [valve, op byte, operand] (a valve test) or the connective's cmd. */
  const tokens = (sets: readonly ZAnimRtSet[]) => addAMission(sets).sequences.flatMap((q) => q.commands).filter((c) => c.set === 0 && c.cmd === 2).map((c) => conditionTokens(c).map((t) => {
    if (t.cmd !== 61) return t.cmd;
    const v = new DataView(t.bytes.buffer, t.bytes.byteOffset, t.bytes.byteLength);
    return [addAMission(sets).names[v.getUint32(4, true)], v.getUint8(12), v.getUint32(8, true)];
  }));

  it.skipIf(!HAVE)('the disc\'s test reads row 0 as Medley with respawn off: IF tmp_idx == 0 AND mp_allow_respawn == 0', () => {
    expect(tokens(discAnimSets())).toEqual([[['num_missions', 4, 12]], [['tmp_idx', 2, 0], 43, ['mp_allow_respawn', 2, 0]], [['IsMedleyGame', 2, 1]]]);
  });

  it.skipIf(!HAVE)('playListSets: tmp_idx == 0 becomes tmp_idx < 0 (never), one byte; every other command and set as the disc\'s; the disc\'s own sets untouched', () => {
    const disc = discAnimSets();
    const before = JSON.stringify(tokens(disc));
    const amended = playListSets(disc);
    expect(tokens(amended)).toEqual([[['num_missions', 4, 12]], [['tmp_idx', 4, 0], 43, ['mp_allow_respawn', 2, 0]], [['IsMedleyGame', 2, 1]]]);
    expect(JSON.stringify(tokens(disc))).toBe(before);
    expect(amended.length).toBe(disc.length);
    let differing = 0;
    for (const [i, set] of disc.entries()) {
      for (const [j, anim] of set.anims.entries()) {
        for (const [k, q] of anim.sequences.entries()) {
          for (const [l, c] of q.commands.entries()) {
            const a = amended[i]!.anims[j]!.sequences[k]!.commands[l]!;
            for (let b = 0; b < c.bytes.length; b++) if (a.bytes[b] !== c.bytes[b]) differing++;
          }
        }
      }
    }
    expect(differing).toBe(1);
  });

  it('a set without the test is returned as it was', () => {
    const sets: ZAnimRtSet[] = [{ name: 'dlgMenu.rdr', anims: [] }];
    expect(playListSets(sets)[0]).toBe(sets[0]);
  });
});

describe('CREATE: CreateMPGame, CreateGame1 and cbCreateGame', () => {
  it('GF3: 0 with no affiliation; affiliation 1..4 the nibble 0xa..0xd over the clan id (-1 with no clan)', () => {
    expect(clanField(0, 1234)).toBe(0);
    expect(clanField(1, 0x123) >>> 0).toBe(0xa0000123);
    expect(clanField(4, 0x123) >>> 0).toBe(0xd0000123);
    expect(clanField(2, -1)).toBe(-1);
  });

  it('CLAN-ID-WIRE: a member\'s create sends GF3 over his clan id (DAT_0044f59c, FUN_002e8bd0 D:L187810-187812) for each affiliation; none, -1', () => {
    const gf3 = (affiliation: number, clanId?: number): number => {
      const t = rows(clanId === undefined ? {} : { clanId });
      t.valves.set('CreateClanAffiliation', affiliation, VALVE_TYPE.TEMP);
      expect(t.c.CreateMPGame(cmd('CreateMPGame'), null as never, undefined)).toBe(true);
      return t.sent[0]!.genericField3;
    };
    // FUN_002e99f0 (D:L188258-188282) after FUN_002e9840 (D:L188174-188201): clan 12 under affiliations 1..4.
    expect([1, 2, 3, 4].map((a) => gf3(a, 12) >>> 0)).toEqual([0xa000000c, 0xb000000c, 0xc000000c, 0xd000000c]);
    expect([1, 2, 3, 4].map((a) => gf3(a, 12))).toEqual([1, 2, 3, 4].map((a) => clanField(a, 12)));
    expect(gf3(0, 12)).toBe(0);                                                   // no affiliation: 0, a member or not
    expect([1, 2, 3, 4].map((a) => gf3(a, -1))).toEqual([-1, -1, -1, -1]);       // in no clan: the id -1 under the nibble
    expect([1, 2, 3, 4].map((a) => gf3(a))).toEqual([-1, -1, -1, -1]);           // no clan reader: as in no clan
  });

  it('CreateMPGame: the name with "$~" and the room, mp_persistent 0, sort order 127, the request, answer 1', async () => {
    const t = rows();
    expect(t.c.CreateMPGame(cmd('CreateMPGame'), null as never, undefined)).toBe(true);
    expect(t.sent).toEqual([{
      applicationId: 0x28e8, minPlayers: 2, maxPlayers: 24, gameLevel: 0, gameName: 'test$~Bravo', gamePassword: '', spectatorPassword: '',
      playerSkillLevel: 0, rulesSet: 0, genericField1: 3, genericField2: 65000, genericField3: 0, gameHostType: 0,
    }]);
    expect([t.valves.find('mp_persistent')!.value, t.valves.find('mp_game_sort_order')!.value]).toEqual([0, 127]);
    await flush();
    expect(t.created.map((g) => [g.mediusWorldId, g.gameName])).toEqual([[9, 'test$~Bravo']]);
    expect(t.ran).toEqual(['SwitchMenu(PREVIOUS_SCREEN)']);
  });

  it('not online: answer 0, nothing sent; no room id: MP_GAME_NAME_EXISTS and 0', () => {
    const off = rows({ up: false });
    expect(off.c.CreateMPGame(cmd('CreateMPGame'), null as never, undefined)).toBe(false);
    expect([off.sent, off.events]).toEqual([[], []]);
    const none = rows({ room: -1 });
    expect(none.c.CreateMPGame(cmd('CreateMPGame'), null as never, undefined)).toBe(false);
    expect([none.sent, none.events]).toEqual([[], [DIALOG_EVENTS.MP_GAME_NAME_EXISTS]]);
  });

  it('the reply: -975 MP_GAME_NAME_EXISTS; any other failure MP_MEDIUS_JOIN_GAME_FAILURE; neither hands off', async () => {
    for (const [status, ev] of [[-975, DIALOG_EVENTS.MP_GAME_NAME_EXISTS], [-966, DIALOG_EVENTS.MP_MEDIUS_JOIN_GAME_FAILURE], [-945, DIALOG_EVENTS.MP_MEDIUS_JOIN_GAME_FAILURE]] as const) {
      const t = rows({ reply: { status, mediusWorldId: -1 } });
      t.c.CreateMPGame(cmd('CreateMPGame'), null as never, undefined);
      await flush();
      expect([t.events, t.created, t.ran]).toEqual([[ev], [], []]);
    }
  });

  it('a password and spectators: the password sent with PasswordValve on; spectators off empty their password and add no seat', () => {
    const t = rows();
    t.valves.set('PasswordValve', 1, VALVE_TYPE.TEMP);
    t.valves.set('MaxSpectatorsValve', 0, VALVE_TYPE.TEMP);
    t.uiVars.set(t.uiVars.add('PlayerGamePassword', null, 2), S('pw'));
    t.uiVars.set(t.uiVars.add('SpectatorGamePassword', null, 2), S('spec'));
    const q = t.c.request('g$~Bravo');
    expect([q.gamePassword, q.spectatorPassword, q.maxPlayers]).toEqual(['pw', '', 16]);
    expect(t.uiVars.find('SpectatorGamePassword')!.value).toEqual(S(''));   // FUN_002edda0 empties it (D:L190545-190547)
  });

  it('a reply to an earlier create is dropped', async () => {
    const t = rows({ reply: null });
    t.c.CreateMPGame(cmd('CreateMPGame'), null as never, undefined);
    t.c.CreateMPGame(cmd('CreateMPGame'), null as never, undefined);
    t.pending[0]!({ status: -966, mediusWorldId: -1 });
    await flush();
    expect([t.sent.length, t.events]).toEqual([2, []]);
  });

  // OT.R71: RESPAWN is offered on every server that hosts games -- the original's own row, which init_cg_screen leaves
  // alone (research 163 section 3: nothing in the set disables it but OT.R21's adaptation). Was: "on init_cg_screen it
  // disables RESPAWN (RESPAWN_ROW_DISABLED_READING)", and an explicit development capability ran EnableButton.
  it('SetMission keeps the mission; on init_cg_screen RESPAWN is left as the original draws it, offered (OT.R71)', () => {
    for (const respawnRules of [undefined, true]) {
      const t = rows({ respawnRules });
      t.c.SetMission(cmd('SetMission', 'NONE', 'MissionShortcutSKB'), null as never, undefined);
      expect([t.c.mission(), t.ran]).toEqual(['NONE', []]);
      t.c.SetMission(cmd('SetMission', 'NONE', 'init_cg_screen'), null as never, undefined);
      expect(t.ran, String(respawnRules)).toEqual([]);
    }
  });
  it('respawnRules false (a test\'s; a page with respawn off) keeps OT.R21\'s disabled row (RESPAWN_ROW_DISABLED_READING)', () => {
    const t = rows({ respawnRules: false });
    t.c.SetMission(cmd('SetMission', 'NONE', 'init_cg_screen'), null as never, undefined);
    expect(t.ran).toEqual(['DisableButton(Respawn)']);
  });
  it('the request\'s native RulesSet stays 0 with respawn chosen: the host\'s world report carries it (research 159 section 3.4)', () => {
    const t = rows();
    t.c.SetMission(cmd('SetMission', 'NONE', 'init_cg_screen'), null as never, undefined);
    t.valves.set('mp_allow_respawn', 1, VALVE_TYPE.TEMP);
    expect(t.c.request('g$~Bravo').rulesSet).toBe(0); // CreateGame1's native field is independent of the later world report
  });
});
