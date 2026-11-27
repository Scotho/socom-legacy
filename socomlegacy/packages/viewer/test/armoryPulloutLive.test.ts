import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { arsenalOf, parseUiLayout, type Side, type UiOp, type UiProgram } from '@s2u/scene';
import { NO_PAD, VALVE_TYPE, ValveStore, type PadSlotName, type UiModelGeometry } from '@s2u/ui';
import type { ArmoryData } from '../src/armoryData';
import { ARMORY_PULLOUT_LIVE_OWNER, LOBBY_ARMORY_DIALOG, LOBBY_DIALOG, LobbyArmory, PULLOUT_BACK_CUTOFF_S, type LobbyArmoryPorts } from '../src/lobbyArmory';

/**
 * WM.R25 (the owner, INTAKE 98, 2026-11-16: "the 5 sec countdown should let you finish picking your weapon not freeze
 * you"; a departure from the original on his word, `ARMORY_PULLOUT_LIVE_OWNER`). The original's pull-out -- the disc's
 * `dlg_equipment_mp.rdr` `UiBackToLobby`: on the launch count's first tick popup 47 ("taken back to the game lobby in 5
 * seconds"), modal (a shown popup takes every press, `FUN_00368650`, research 182 §2.4), then `SWITCHMENU` to the lobby
 * 5 s later (research 95 R95.7, 167 R167.3) -- keeps its timing; with the ruling on, popup 47 is a notice over a screen
 * that still takes the pad and the taps, every change still reaching the room (`loadout`), and DONE or Triangle returns
 * to the lobby at once. With it off, today's modal path. The lobby ARMORY test's synthetic map (`./lobbyArmory.test.ts`);
 * unit tests, no disc.
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

const FRAME = 1 / 30;

function rig(live?: boolean) {
  const valves = new ValveStore();
  const set = (n: string, v: number): void => { valves.acquire(n, VALVE_TYPE.PERM); valves.set(n, v, VALVE_TYPE.PERM); };
  set('player_team', 0);
  let backs = 0;
  const toRoom: [Side, { char: number; picks: readonly { slot: number; id: number }[] }][] = [];
  const ports: LobbyArmoryPorts = {
    load: () => Promise.resolve(DATA),
    model: (n) => (n === 'sig_commandoUI' ? GUN : null), modelTextures: (n) => (n === 'sig_commando' ? px(2) : null),
    valves: () => valves, uiVar: () => null, profile: { record: () => null, mode: () => true },
    mission: () => 'mp2', sound: () => {}, back: () => { backs++; },
    loadout: (side, choice) => { toRoom.push([side, choice]); },
    ...(live === undefined ? {} : { pulloutLive: live }),
  };
  const l = new LobbyArmory(ports);
  /** The time since the pull-out began (s), or null before it. */
  let since: number | null = null;
  const tick = (dialog: string = LOBBY_ARMORY_DIALOG, popup = false, down: PadSlotName[] = []): void => {
    l.pad({ ...NO_PAD, down: new Set(down) });
    l.frame(FRAME, dialog, popup);
    if (since !== null) since += FRAME;
  };
  /** One press (down one frame, up the next), the popup still showing when the pull-out has begun. */
  const press = (b: PadSlotName): void => { const p = since !== null; tick(LOBBY_ARMORY_DIALOG, p, [b]); tick(LOBBY_ARMORY_DIALOG, p); };
  /** Frames until `t` seconds after the pull-out, the popup showing (the dialog's UiBackToLobby, its WAIT 5). */
  const until = (t: number): void => { while ((since ?? 0) < t - 1e-9) tick(LOBBY_ARMORY_DIALOG, true); };
  const enter = async (): Promise<void> => { tick(LOBBY_DIALOG); await new Promise((r) => setTimeout(r, 0)); tick(); };
  /** The launch count's first tick: UiBackToLobby's ArmoryClock copy differs from mp_x_sec_clock; popup 47 shows. */
  const pull = (): void => { set('ArmoryClock', 11); set('mp_x_sec_clock', 10); tick(LOBBY_ARMORY_DIALOG, true); since = 0; };
  /** The script's SWITCHMENU 5 s after the popup: the lobby. */
  const switched = (): void => { tick(LOBBY_DIALOG); };
  return { l, toRoom, backs: () => backs, tick, press, until, enter, pull, switched, since: () => since };
}

describe('WM.R25: the ARMORY under the launch count\'s pull-out stays live (the owner, INTAKE 98)', () => {
  it('the ruling is on by default and named', () => {
    expect(ARMORY_PULLOUT_LIVE_OWNER).toBe(true);
  });

  it('on: popup 47 still shows (the script\'s notice), but a press during it reaches the screen', async () => {
    const r = rig();
    await r.enter();
    expect(r.l.hosting()).toBe(true);
    r.pull();
    expect(r.l.armory.state()?.pulledAt).not.toBe(null);                    // the notice, as the original's
    r.press('CROSS');                                                        // SEAL 1 committed: its rows
    expect(r.l.armory.state()?.screen).not.toBe('select');
  });

  it('on: the last choice made at 4.9 s is the loadout the room is sent when the script\'s SWITCHMENU closes the screen at 5 s', async () => {
    const r = rig();
    await r.enter();
    r.press('CROSS');                                                        // committed before the count
    r.pull();
    r.until(4.8);
    r.press('RIGHT');                                                        // the primary changed at ~4.87 s
    expect(r.since()).toBeLessThan(5);
    const chosen = r.l.armory.state()!.kits[0]![0]!;
    expect(chosen).not.toBe(57);
    r.until(5);
    r.switched();                                                            // TakenBack, SWITCHMENU dlgGameLobby.rdr
    expect(r.l.hosting()).toBe(false);
    const last = r.toRoom.at(-1);
    expect(last?.[0]).toBe('seal');
    expect(last?.[1].picks).toContainEqual({ slot: 0, id: chosen });
  });

  it('on: Triangle on character select (returnto_lobby) during the 5 s returns to the lobby at once', async () => {
    const r = rig();
    await r.enter();
    r.pull();
    r.press('TRIANGLE');
    expect(r.backs()).toBe(1);
  });

  it('on: in the wait\'s last half second (PULLOUT_BACK_CUTOFF_S) Triangle closes the screen and leaves the switch to the script (no second lobby on the history)', async () => {
    expect(PULLOUT_BACK_CUTOFF_S).toBe(4.5);                                 // the script's WAIT 5 less the fader's 0.5 s
    const r = rig();
    await r.enter();
    r.pull();
    r.until(4.6);
    r.press('TRIANGLE');
    expect([r.backs(), r.l.hosting()]).toEqual([0, true]);                   // closed, its last frame up; no page switch
    r.until(5);
    r.switched();                                                            // the script's SWITCHMENU
    expect([r.backs(), r.l.hosting()]).toEqual([0, false]);
  });

  it('off (the original): popup 47 takes every press -- the screen does not move and nothing new is sent; the SWITCHMENU still closes it', async () => {
    const r = rig(false);
    await r.enter();
    r.press('CROSS');
    r.pull();
    const before = r.toRoom.length, row = r.l.armory.state()?.row, kit = r.l.armory.state()!.kits[0]![0];
    r.press('RIGHT');                                                        // live, this would change the primary
    r.press('TRIANGLE');                                                     // live, this would open the row's confirm
    expect([r.l.armory.state()?.row, r.l.armory.state()?.kits[0]![0], r.l.armory.state()?.screen, r.backs()]).toEqual([row, kit, 'row', 0]);
    r.until(5);
    r.switched();
    expect(r.l.hosting()).toBe(false);
    expect(r.toRoom.length).toBe(before);                                    // the flush sends what was already chosen, if anything
  });
});
