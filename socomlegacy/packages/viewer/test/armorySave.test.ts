import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { arsenalOf, parseUiLayout, type Side, type UiOp, type UiProgram } from '@s2u/scene';
import {
  ArmoryProfileCommands, NO_PAD, VALVE_TYPE, ValveStore, type ArmoryLoadoutProfile, type ArmoryLoadoutRecord, type PadSlotName, type UiModelGeometry,
} from '@s2u/ui';
import type { ArmoryData } from '../src/armoryData';
import { uiOf } from '../src/armoryState';
import { fetchGameLobbyService, sessionLoadouts } from '../src/gameLobbyHost';
import { LOBBY_ARMORY_DIALOG, LOBBY_DIALOG, LobbyArmory, type LobbyArmoryPorts } from '../src/lobbyArmory';

/**
 * ARMORY-SAVE (web sprint 41; the owner: "armory isn't saving selections" -- the online GAME LOBBY's ARMORY; "we will
 * keep it as is, but it needs to be known why it failed"). Step 1, the root cause: the owner's path through the real
 * modules of the page -- the shared ARMORY on the lobby's `dlg_equipment_mp.rdr` (`../src/lobbyArmory`), the account's
 * rows (`@s2u/ui`'s `ArmoryProfileCommands`, `CharacterProfile` 0..7, research 167 R167.4) and SVC-24's transport
 * (`../src/gameLobbyHost` `sessionLoadouts` over `fetchGameLobbyService`), its `GET` / `PUT /lobby/loadout` answered by
 * an in-memory server keyed as `packages/central/src/serviceStore.ts` keys the records (the mission upper-cased, a side).
 *
 * - **The control** (the page's STORE LOADOUT, Square: modes 1 then 3): the changed weapon reaches the server, the next
 *   ARMORY entry opens on it (CUSTOM) and a fresh page (a re-login: `DownloadCharacterProfile`'s mode 5) opens on it --
 *   the send, the store's key and the re-entry's load keep a stored selection.
 * - **The RED** (the owner's path without Square: a weapon changed, DONE): nothing of the choice leaves the page. The
 *   shared screen's change goes only to the lobby's valves and the session's `held` map (`LobbyArmory.choose`), which no
 *   part of the match path reads: the game lobby's hand-off carries no kit (`GameLobbyHandOff`), and the match learns
 *   only the account's stored record, read by the bridge at the launch (`STORED_LOADOUT_AT_LAUNCH_ADAPTATION`, research
 *   167 R167.7). On the console the kit is the console's own -- the ARMORY's choices are made on it and the match plays
 *   them, STORE LOADOUT only keeps them for later (`bridge.ts`'s own words at the adaptation) -- so the choice is the
 *   seat's next type and kit: here a `loadout` request to the room (protocol 9: `char`, `picks`), which the room takes
 *   outside a round for the next spawn (`Room.loadout`, ARMORY_OUTSIDE_ROUND_READING). The port the test hands the
 *   screen for it (`loadout`) does not exist yet: the fix's proposal, named here, not written.
 *
 * The data is the lobby ARMORY test's own synthetic map (`./lobbyArmory.test.ts`): no disc.
 */

const obj = (...kv: RdrNode[]): RdrNode[] => kv;
const layout = parseUiLayout([[
  'SCREENS', [
    'LIBRARIES', ['ui/assetlib/uimp'], 'BACKGROUND', ['TYPE', ['IMAGE'], 'FILENAME', ['multplay_back.tif']], 'FONT', ['font_text_01'],
    'OBJECTS', [
      obj('NAME', ['Seal1PrimDummy'], 'TYPE', ['TEXT'], 'XPOS', ['25'], 'YPOS', ['150'], 'SPEC', ['CAPTION', [' ']]),
      obj('NAME', ['Seal1'], 'TYPE', ['IMAGE'], 'XPOS', ['0'], 'YPOS', ['0'], 'SPEC', ['CHILDOF', ['Seal1PrimDummy'], 'UIVAR', ['NAME', ['Seal1']], 'SIZE', ['128', '256']]),
    ],
    'ANIMATIONS', [obj('EVENT', ['ONSTART'], 'ANIMATION', ['ShowGun'])],
    'CONTROLS', [obj('NAME', ['EquipMpSealBtn'], 'TYPE', ['BUTTON'], 'SPEC', [])],
    'MODELS', [obj('NAME', ['Equipsig_commando'], 'MODEL', ['sig_commandoUI'], 'AZIMUTH', ['10.5'], 'ELEV', ['2.75'], 'DISTANCE', ['27'])],
  ],
]]);
const program = (name: string, ops: UiOp[]): UiProgram => ({ name, nodes: [], sequences: [{ name: 'NA', activation: 1, ops }] });
const PROGRAMS = [program('ShowGun', [{ op: 'active', node: 'Equipsig_commando', on: true }])];
const rec = (...pairs: [string, RdrNode][]): RdrNode[] => pairs.flatMap(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
const item = (name: string, id: number): RdrNode[] => rec(['InternalName', name], ['ID', String(id)], ['AMMO_TYPES', []]);
const ARSENAL = arsenalOf(['ZAMMO', [], 'ZWEAPON', [item('552', 57), item('M4A1', 54), item('Mark 23', 15), item('M67', 121), item('HE', 126), item('Double Ammo Load', 194)]] as RdrNode);
const VALVES = new Map([['Enablesig_commando', 1], ['Enable_m4Acarbine', 1], ['Enable_Mark23', 1], ['Enable_frag', 9], ['Enable_HEgren', 9], ['Enable_2xammo', 9]]);
const px = (n: number) => ({ width: n, height: n, data: new Uint8ClampedArray(n * n * 4).fill(200) });
const character = (column: string, index: number) => ({
  column: column as 'Seal1', side: 'seal' as const, index, type: column, character: column, model: null, textures: [],
  loadout: [57, 15, 121, 126, 194] as never, portrait: 'Seal1_scuba.tif',
});
const DATA: ArmoryData = {
  archive: 'MP2', layout, uiSounds: [], scripts: [{ set: LOBBY_ARMORY_DIALOG, programs: PROGRAMS }], items: [], fonts: [], models: [], modelTextures: [],
  strings: [], light: null, missing: [],
  bitmaps: [['multplay_back.tif', px(4)], ['seal1_scuba.tif', px(8)]],
  roster: { equipmentLibrary: null, equipmentStem: null, missionTitle: 'FROSTFIRE', characters: [character('Seal1', 0), character('Seal2', 1)] },
  world: { arsenal: ARSENAL, valves: VALVES },
};
const GUN: UiModelGeometry = {
  name: 'sig_commandoUI',
  parts: [{ node: 'commando_high', meshes: [{ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), uvs: new Float32Array(6), colors: new Float32Array(12).fill(1), indices: new Uint16Array([0, 1, 2]), texture: 'sig_commando', cull: false }] }],
};

/** SVC-24's server as the page reaches it: `GET` every record of the bearer's account, `PUT` one side of one mission. */
function server() {
  const records = new Map<string, ArmoryLoadoutRecord>();
  const puts: { mission: string; side: 'seal' | 'terrorist'; profile: ArmoryLoadoutProfile }[] = [];
  const fetchFn = ((_url: string, init: RequestInit) => {
    if (init.method === 'PUT') {
      const body = JSON.parse(init.body as string) as (typeof puts)[number];
      puts.push(body);
      const key = body.mission.toUpperCase();
      const r = records.get(key) ?? { mission: key, seal: null, terrorist: null };
      r[body.side] = body.profile;
      records.set(key, r);
      return Promise.resolve(new Response(JSON.stringify({ status: 0 }), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ loadouts: [...records.values()] }), { status: 200 }));
  }) as unknown as typeof fetch;
  return { records, puts, transport: fetchGameLobbyService('https://site.test', fetchFn) };
}

/** The proposal's port: the seat's next type and kit handed to the room (a `loadout` request); recorded, absent today. */
type RoomPort = { loadout(side: Side, choice: { char: number; picks: readonly { slot: number; id: number }[] }): void };

/** One page of the account: the lobby's valves (a SEAL seat), the account's rows over SVC-24, the shared ARMORY. */
function page(srv: ReturnType<typeof server>) {
  const valves = new ValveStore();
  valves.acquire('player_team', VALVE_TYPE.PERM);
  valves.set('player_team', 0, VALVE_TYPE.PERM);
  const lost: string[] = [];
  const profile = new ArmoryProfileCommands({ valves: () => valves, mission: () => 'mp2', service: sessionLoadouts(srv.transport, () => 'tkt', (t) => { lost.push(t); }) });
  const toRoom: Parameters<RoomPort['loadout']>[] = [];
  const ports: LobbyArmoryPorts & RoomPort = {
    load: () => Promise.resolve(DATA),
    model: (n) => (n === 'sig_commandoUI' ? GUN : null), modelTextures: (n) => (n === 'sig_commando' ? px(2) : null),
    valves: () => valves, uiVar: () => null, profile, mission: () => 'mp2', sound: () => {}, back: () => {},
    loadout: (side, choice) => { toRoom.push([side, choice]); },
  };
  const l = new LobbyArmory(ports);
  const tick = (dialog: string = LOBBY_ARMORY_DIALOG, down: PadSlotName[] = []): void => {
    l.pad({ ...NO_PAD, down: new Set(down) });
    l.frame(1 / 30, dialog, false);
  };
  // One press, then ~3 s of frames: past every step's suspension (the store's is 3.0 s, SUSPEND.store).
  const press = (b: PadSlotName): void => { tick(LOBBY_ARMORY_DIALOG, [b]); tick(); for (let i = 0; i < 90; i++) tick(); };
  const settle = async (): Promise<void> => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
  /** The disc dialog's ONSTART row the machine runs as the ARMORY is entered (`InitializeOnlineArmory`, the records asked again). */
  const enter = async (): Promise<void> => {
    tick(LOBBY_DIALOG); await settle();
    (profile.InitializeOnlineArmory as unknown as () => boolean)();
    await settle();
    tick();
  };
  /** DONE: down to the DONE row (6), CROSS (`OnEquipDoneBtnPress`), then the lobby. */
  const done = (): void => {
    for (let i = 0; i < 6 && l.armory.state()?.row !== 6; i++) press('DOWN');
    press('CROSS');
    tick(LOBBY_DIALOG);
  };
  return { l, profile, valves, toRoom, lost, tick, press, settle, enter, done };
}

describe('ARMORY-SAVE: the online game lobby\'s ARMORY selection, from the screen to the account and the match', () => {
  it('control -- STORE LOADOUT (Square: CharacterProfile 1, then 3): the changed weapon reaches the server, the next entry and a fresh page open on it', async () => {
    const srv = server();
    const p = page(srv);
    await p.enter();
    expect(p.l.hosting()).toBe(true);
    p.press('CROSS');                                                        // SEAL 1 committed: its rows
    p.press('RIGHT');                                                        // the primary changed
    const chosen = p.l.armory.state()!.kits[0]![0]!;
    expect(chosen).not.toBe(57);                                             // not the type's own 552
    p.press('SQUARE');                                                       // STORE LOADOUT
    await p.settle();
    expect(srv.puts.map((b) => [b.mission, b.side, b.profile.items[0], b.profile.valid])).toEqual([['MP2', 'seal', uiOf(chosen), true]]);
    expect(srv.records.get('MP2')?.seal?.items[0]).toBe(uiOf(chosen));
    p.done();
    await p.enter();                                                         // the lobby's next ARMORY entry
    expect([p.l.armory.state()?.custom, p.l.armory.state()?.kits[0]![0]]).toEqual([0, chosen]);
    const fresh = page(srv);                                                 // a re-login: a new page of the account
    fresh.profile.mode(5);                                                   // dlgNetConnect's DownloadCharacterProfile
    await fresh.settle();
    await fresh.enter();
    expect([fresh.l.armory.state()?.custom, fresh.l.armory.state()?.kits[0]![0]]).toEqual([0, chosen]);
    expect([p.lost, fresh.lost]).toEqual([[], []]);
  });

  it('RED -- the owner\'s path: a weapon changed and DONE (no Square) reaches the room as the seat\'s next type and kit; nothing is stored', async () => {
    const srv = server();
    const p = page(srv);
    await p.enter();
    p.press('CROSS');
    p.press('RIGHT');
    const chosen = p.l.armory.state()!.kits[0]![0]!;
    expect(chosen).not.toBe(57);
    p.done();
    await p.settle();
    // Today the choice stays on the page: the lobby's valves and the session's `held` (LobbyArmory.choose) -- and the
    // match, which reads neither, spawns the account's stored record or the type's own kit (bridge.ts storedLoadouts).
    expect(['MpCharSet', 'primsel'].map((n) => p.valves.find(n)?.value)).toEqual([1, uiOf(chosen)]);
    expect(srv.puts).toEqual([]);                                            // DONE is no STORE LOADOUT: no record kept
    const last = p.toRoom.at(-1);
    expect(last?.[0]).toBe('seal');
    expect(last?.[1].char).toBe(0);
    expect(last?.[1].picks).toContainEqual({ slot: 0, id: chosen });
  });

  it('RED -- the second finding: with a stored record, the ARMORY entered again opens on the choice committed since the lobby\'s entry, CUSTOM on the stored column', async () => {
    // The original: a character committed in the ARMORY sets IDFromBriefing 1 (`OnMp{Seal,Terr}BtnPress` seq 0, research
    // 95 §3.2), so the lobby's ONSTART `FromBriefing` on the way back loads no record over it (`IF IDFromBriefing == 0`,
    // tools/test/onlineDialogs.pinned.json P:L7561-7585); the ARMORY's own entry only captions the stored column CUSTOM
    // (`UiEquipSwitch`: `CharacterProfile` 2, no mode 0 -- research 95 §3.1). Today `openArmory` lays the record over
    // the session's choice (armoryState.ts:364-368).
    const srv = server();
    srv.records.set('MP2', { mission: 'MP2', seal: { charSet: 1, items: [8, 75, 36, 37, 35], valid: true }, terrorist: null });
    const p = page(srv);
    p.profile.mode(5);                                                       // the login's DownloadCharacterProfile
    await p.settle();
    await p.enter();
    expect([p.l.armory.state()?.custom, p.l.armory.state()?.kits[0]![0]]).toEqual([0, 57]);   // the record: CUSTOM, its 552
    p.press('CROSS');
    p.press('RIGHT');
    const chosen = p.l.armory.state()!.kits[0]![0]!;
    expect(chosen).not.toBe(57);
    p.done();                                                                // no Square: the record stays the 552
    await p.enter();
    expect([p.l.armory.state()?.custom, p.l.armory.state()?.kits[0]![0]]).toEqual([0, chosen]);
    expect(srv.records.get('MP2')?.seal?.items[0]).toBe(8);
  });

  it('the session\'s choice is the console\'s IDFromBriefing: gone after the match\'s load and after a change of side -- the record again', async () => {
    const srv = server();
    srv.records.set('MP2', { mission: 'MP2', seal: { charSet: 1, items: [8, 75, 36, 37, 35], valid: true }, terrorist: null });
    const run = async (between: (p: ReturnType<typeof page>) => void): Promise<number | undefined> => {
      const p = page(srv);
      p.profile.mode(5);
      await p.settle();
      await p.enter();
      p.press('CROSS');
      p.press('RIGHT');
      expect(p.l.armory.state()!.kits[0]![0]).not.toBe(57);
      p.done();
      between(p);
      await p.enter();
      return p.l.armory.state()?.kits[0]![0];
    };
    // The match's load screen (P:L4293's BRIEFING ROOM alike): the map's load drops the TEMP valve (research 309 §2.3).
    expect(await run((p) => { p.tick('dlgLoad.rdr'); })).toBe(57);
    // SWITCH TEAMS and back: `switch_teams_anim` re-armed the seat from the record (P:L7596-7615).
    expect(await run((p) => {
      p.valves.set('player_team', 8, VALVE_TYPE.PERM); p.tick(LOBBY_DIALOG);
      p.valves.set('player_team', 0, VALVE_TYPE.PERM); p.tick(LOBBY_DIALOG);
    })).toBe(57);
  });
});
