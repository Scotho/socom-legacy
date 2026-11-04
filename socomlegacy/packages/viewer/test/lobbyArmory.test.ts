import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseRdr, Zar, type RdrNode } from '@s2u/archive';
import { arsenalOf, parseUiLayout, type UiOp, type UiProgram } from '@s2u/scene';
import {
  DIALOG_BUTTON_STATES, DIALOG_BUTTONS, loadDialog, NO_PAD, UI_TICK_SECONDS, VALVE_TYPE, ValveStore, type ArmoryLoadoutProfile, type DialogDesign, type PadSlotName,
  type UiModelGeometry, type UiSoundCues, type ZAnimRtSet,
} from '@s2u/ui';
import { FIXTURES_ABSENT } from '../../archive/test/fixtures';
import type { ArmoryData } from '../src/armoryData';
import { ARMORY_WHITE } from '../src/armoryLayout';
import { ARMORY_MODEL_TEXTURE } from '../src/armoryRaster';
import { FrontEndSession, matchMenuHold } from '../src/frontEnd';
import { PAD_BUTTON, type PadButton, type PadLike, type PadSource } from '../src/gamepad';
import { MenuPageInput } from '../src/menuInput';
import { GamePad } from '../src/setupPad';
import {
  ARMORY_STICK_ARMING_READING, ARMORY_STICK_SAME_FRAME_READING, LOBBY_ARMORY_DIALOG, LOBBY_DIALOG, LobbyArmory, type LobbyArmoryPorts,
} from '../src/lobbyArmory';
import { animation, sound } from '../../ui/test/screens/zanimAsm';

/**
 * The shared ARMORY on the game lobby's page (the owner's playtest of 2026-10-06: the lobby's ARMORY drew no images):
 * `./lobbyArmory` hosts the test room's screen (`./armory`) when the front end's machine enters
 * `dlg_equipment_mp.rdr` -- the disc's dialog stays built underneath for its lobby work (`UiBackToLobby`, the errors),
 * the shared screen draws and takes the pad -- and hands its choices to the lobby's valves and its stores to the
 * account's records (`@s2u/ui`'s `ArmoryProfileCommands`, SVC-24).
 */

const obj = (...kv: RdrNode[]): RdrNode[] => kv;
const layout = parseUiLayout([[
  'SCREENS', [
    'LIBRARIES', ['ui/assetlib/uimp'], 'BACKGROUND', ['TYPE', ['IMAGE'], 'FILENAME', ['multplay_back.tif']], 'FONT', ['font_text_01'],
    'OBJECTS', [
      obj('NAME', ['Seal1PrimDummy'], 'TYPE', ['TEXT'], 'XPOS', ['25'], 'YPOS', ['150'], 'SPEC', ['CAPTION', [' ']]),
      obj('NAME', ['eq_Seal1_win'], 'TYPE', ['IMAGE'], 'XPOS', ['-10'], 'YPOS', ['-47'], 'SPEC', ['CHILDOF', ['Seal1PrimDummy'], 'FILENAME', ['backsolid.tif'], 'SIZE', ['150', '290']]),
      obj('NAME', ['Seal1'], 'TYPE', ['IMAGE'], 'XPOS', ['0'], 'YPOS', ['0'], 'SPEC', ['CHILDOF', ['Seal1PrimDummy'], 'UIVAR', ['NAME', ['Seal1']], 'SIZE', ['128', '256']]),
    ],
    'ANIMATIONS', [obj('EVENT', ['ONSTART'], 'ANIMATION', ['ShowGun']), obj('EVENT', ['ONSTART'], 'ANIMATION', ['UiBackToLobby'])],
    'CONTROLS', [obj('NAME', ['EquipMpSealBtn'], 'TYPE', ['BUTTON'], 'SPEC', [])],
    'MODELS', [obj('NAME', ['Equipsig_commando'], 'MODEL', ['sig_commandoUI'], 'AZIMUTH', ['10.5'], 'ELEV', ['2.75'], 'DISTANCE', ['27'])],
  ],
]]);
const program = (name: string, ops: UiOp[]): UiProgram => ({ name, nodes: [], sequences: [{ name: 'NA', activation: 1, ops }] });
const PROGRAMS = [
  program('ShowGun', [{ op: 'active', node: 'Equipsig_commando', on: true }, { op: 'active', node: 'silencer', on: false }, { op: 'sound', sound: '.DINK', flags: 0xb0, newPlay: true, node: 0, volume: 0.5, pan: 64 }]),
  program('UiBackToLobby', [{ op: 'valve', valve: 'Pulled', operation: '=', operand: 1 }]),
];
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
  archive: 'MP2', layout, uiSounds: [], scripts: [{ set: 'dlg_equipment_mp.rdr', programs: PROGRAMS }], items: [], fonts: [], models: [], modelTextures: [],
  strings: [], light: null, missing: [],
  bitmaps: [['multplay_back.tif', px(4)], ['backsolid.tif', px(2)], ['seal1_scuba.tif', px(8)]],
  roster: { equipmentLibrary: null, equipmentStem: null, missionTitle: 'FROSTFIRE', characters: [character('Seal1', 0), character('Seal2', 1)] },
  world: { arsenal: ARSENAL, valves: VALVES },
};
const GUN: UiModelGeometry = {
  name: 'sig_commandoUI',
  parts: ['commando_high', 'silencer'].map((node) => ({
    node, meshes: [{ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), uvs: new Float32Array(6), colors: new Float32Array(12).fill(1), indices: new Uint16Array([0, 1, 2]), texture: 'sig_commando', cull: false }],
  })),
};

function rig(o: { data?: ArmoryData | null; team?: number | null } = {}) {
  const valves = new ValveStore();
  const set = (n: string, v: number): void => { valves.acquire(n, VALVE_TYPE.PERM); valves.set(n, v, VALVE_TYPE.PERM); };
  const get = (n: string): number => valves.acquire(n, VALVE_TYPE.PERM).value;
  if (o.team !== null) set('player_team', o.team ?? 0);
  const modes: number[] = [], sounds: string[] = [], loads: string[] = [], cues: unknown[] = [];
  let backs = 0, record: ArmoryLoadoutProfile | null = null;
  const ports: LobbyArmoryPorts = {
    load: (m) => { loads.push(m); return Promise.resolve(o.data === undefined ? DATA : o.data); },
    model: (n) => (n === 'sig_commandoUI' ? GUN : null), modelTextures: (n) => (n === 'sig_commando' ? px(2) : null),
    valves: () => valves, uiVar: (n) => ({ GAMENAMEVAR: 'GAME', MEDIUS_LOBBY_NAME: 'LOCAL' })[n] ?? null,
    profile: {
      record: () => record,
      mode: (m) => {
        modes.push(m);
        if (m === 1) record = { charSet: get('MpCharSet'), items: ['primsel', 'secsel', 'equip1sel', 'equip2sel', 'equip3sel'].map(get) as ArmoryLoadoutProfile['items'], valid: true };
        if (m === 7 && record) record = { ...record, valid: false };
        return true;
      },
    },
    mission: () => 'mp2', sound: (n, cue) => { sounds.push(n); cues.push(cue); }, back: () => { backs++; },
  };
  const l = new LobbyArmory(ports);
  const tick = (dialog: string | null = LOBBY_ARMORY_DIALOG, popup = false, down: PadSlotName[] = [], stick: readonly [number, number] = [0, 0]): void => {
    l.pad({ ...NO_PAD, down: new Set(down), stickX: stick[0], stickY: stick[1] });
    l.frame(1 / 30, dialog, popup);
  };
  const press = (b: PadSlotName, dialog: string | null = LOBBY_ARMORY_DIALOG): void => { tick(dialog, false, [b]); tick(dialog); for (let i = 0; i < 90; i++) tick(dialog); };
  const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
  return { l, valves, set, get, modes, sounds, cues, loads, backs: () => backs, tick, press, settle, record: () => record };
}

describe('the shared ARMORY on the game lobby\'s page (./lobbyArmory)', () => {
  it('reads the mission\'s data in the lobby, before the ARMORY; hosts the dialog once it is in, drawing the screen with its images', async () => {
    const r = rig();
    r.tick('dlgGameLobby.rdr');
    expect([r.loads, r.l.hosting()]).toEqual([['mp2'], false]);
    await r.settle();
    expect(r.l.owns(LOBBY_ARMORY_DIALOG)).toBe(true);                       // the build's sounds are the shared screen's from now
    r.tick();
    expect(r.l.hosting()).toBe(true);
    const items = r.l.drawList();
    const sprites = items.flatMap((i) => (i.kind === 'sprite' ? [i.texture] : []));
    expect(sprites).toEqual(expect.arrayContaining(['multplay_back.tif', 'backsolid.tif', 'seal1_scuba.tif']));   // the background, the panes, the portrait
    // The 552 shown by the scripts, drawn without its silencer (ARMORY_MODEL_PART_REF), its texture the UI models' library's.
    const models = items.find((i) => i.kind === 'models');
    expect(models?.kind === 'models' ? models.triangles?.map((t) => [t.node, t.texture]) : null).toEqual([['commando_high', `${ARMORY_MODEL_TEXTURE}sig_commando`]]);
    expect(r.l.textures(`${ARMORY_MODEL_TEXTURE}sig_commando`)).not.toBe(null);
    expect(r.l.textures(ARMORY_WHITE)).not.toBe(null);
    expect(r.loads).toEqual(['mp2']);                                        // read once a mission
  });

  it('the screen\'s sounds are its scripts\' and its steps\'; its entering .DINK is the lobby\'s (goto_eq_mp_set_return_valve), not played twice', async () => {
    const r = rig();
    r.tick('dlgGameLobby.rdr');
    await r.settle();
    r.tick();
    expect(r.sounds).toEqual(['.DINK']);                                     // ShowGun's SOUND, the open's own .DINK dropped
    expect(r.cues).toEqual([{ volume: 0.5, pan: 64, pitchMod: 0 }]);         // the command's own volume and pan, its pitch the default
  });

  it('a spectator, a mission with no data, or a dialog other than the ARMORY: the disc\'s dialog stays', async () => {
    const spectator = rig({ team: 16 });
    spectator.tick('dlgGameLobby.rdr'); await spectator.settle(); spectator.tick();
    expect(spectator.l.hosting()).toBe(false);
    const none = rig({ data: null });
    none.tick('dlgGameLobby.rdr'); await none.settle(); none.tick();
    expect([none.l.hosting(), none.l.owns(LOBBY_ARMORY_DIALOG)]).toEqual([false, false]);
    const r = rig();
    r.tick('dlgGameLobby.rdr'); await r.settle(); r.tick('dlgGameLobby.rdr');
    expect(r.l.hosting()).toBe(false);
  });

  it('the pad: one step a press (an edge), nothing for a button held from the lobby; the choice reaches the lobby\'s valves', async () => {
    const r = rig();
    r.tick('dlgGameLobby.rdr'); await r.settle();
    r.tick(LOBBY_ARMORY_DIALOG, false, ['CROSS']);                            // the lobby's CROSS still down: not a press
    for (let i = 0; i < 30; i++) r.tick(LOBBY_ARMORY_DIALOG, false, ['CROSS']);
    expect(r.l.armory.state()?.screen).toBe('select');
    r.tick();                                                                // let go
    r.press('CROSS');                                                        // commit SEAL 1: the rows
    expect(r.l.armory.state()?.screen).toBe('row');
    // MpCharSet and the five UI indices, as the disc's Choose* rows leave them (mode 1 reads them).
    expect(['MpCharSet', 'primsel', 'secsel', 'equip1sel', 'equip2sel', 'equip3sel'].map(r.get)).toEqual([1, 8, 75, 36, 37, 35]);
  });

  // AM-2 (research 340 §2): the screen is a dialog of the menu framework, its d-pad bindings all FALLING (no STATE), so
  // the stick's flick fires them as the press does (FUN_00377040 D:L271900-271915; FUN_0036a060 D:L264743-264799).
  // The stick in the game's signs: x positive left, y positive up.
  const RIGHT = [-0.7, 0] as const, LEFT = [0.7, 0] as const, DOWN = [0, -0.7] as const, CENTRE = [0, 0] as const;
  it('the left stick: a flick is the d-pad press -- one step past 0.6, none held, re-armed only within 0.2 (AM-2)', async () => {
    const r = rig();
    r.tick('dlgGameLobby.rdr'); await r.settle();
    r.tick();
    expect([r.l.armory.state()?.screen, r.l.armory.state()?.column]).toEqual(['select', 0]);
    r.tick(LOBBY_ARMORY_DIALOG, false, [], RIGHT);                           // past 0.6 from rest: RIGHT, ActivateMPCharStackRt
    expect(r.l.armory.state()?.column).toBe(1);
    for (let i = 0; i < 60; i++) r.tick(LOBBY_ARMORY_DIALOG, false, [], RIGHT);   // held 2 s: no repeat
    expect(r.l.armory.state()?.column).toBe(1);
    r.tick(LOBBY_ARMORY_DIALOG, false, [], [-0.3, 0]);                       // back, not within 0.2: still disarmed
    r.tick(LOBBY_ARMORY_DIALOG, false, [], RIGHT);
    expect(r.l.armory.state()?.column).toBe(1);
    r.tick(LOBBY_ARMORY_DIALOG, false, [], [-0.15, 0.1]);                    // both within 0.2: re-armed
    r.tick(LOBBY_ARMORY_DIALOG, false, [], LEFT);                            // LEFT, wrapping over the two columns
    expect(r.l.armory.state()?.column).toBe(0);
    r.tick(LOBBY_ARMORY_DIALOG, false, [], CENTRE);
    r.tick(LOBBY_ARMORY_DIALOG, false, ['RIGHT'], RIGHT);                    // a press and a flick the same way: one step
    expect(r.l.armory.state()?.column).toBe(1);
    r.tick();
    expect(ARMORY_STICK_SAME_FRAME_READING).toBe('a frame with a press takes no flick');
  });

  it('the stick\'s diagonals settle as FUN_0036a060 does: up-left and down-left LEFT, down-right DOWN, up-right UP (AM-2)', async () => {
    const r = rig();
    r.tick('dlgGameLobby.rdr'); await r.settle();
    r.tick();
    const flick = (x: number, y: number): void => { r.tick(LOBBY_ARMORY_DIALOG, false, [], [x, y]); r.tick(LOBBY_ARMORY_DIALOG, false, [], CENTRE); r.tick(); };
    const sounds = (): number => r.sounds.length;
    flick(0.7, 0.7);                                                         // up-left (x == y > 0): LEFT, a column
    expect(r.l.armory.state()?.column).toBe(1);
    flick(0.7, -0.7);                                                        // down-left (x == -y > 0): LEFT
    expect(r.l.armory.state()?.column).toBe(0);
    const before = sounds();
    flick(-0.7, -0.7);                                                       // down-right (x == y < 0): DOWN, NothingDwn's .DINK
    flick(-0.7, 0.7);                                                        // up-right (x == -y < 0): UP, NothingUp's .DINK
    expect(r.l.armory.state()?.column).toBe(0);
    expect(r.sounds.slice(before)).toEqual(['.DINK', '.DINK']);
  });

  it('a stick held from the lobby is no flick; a flick held through a suspension steps once at its end (R116.9; AM-2)', async () => {
    const r = rig();
    r.tick('dlgGameLobby.rdr', false, [], RIGHT); await r.settle();          // pushed in the lobby: armed off there
    for (let i = 0; i < 30; i++) r.tick(LOBBY_ARMORY_DIALOG, false, [], RIGHT);
    expect([r.l.armory.state()?.screen, r.l.armory.state()?.column]).toEqual(['select', 0]);
    r.tick();                                                                // back to rest: re-armed
    r.tick(LOBBY_ARMORY_DIALOG, false, ['CROSS']);                           // commit: the rows, input suspended 0.5 s
    expect([r.l.armory.state()?.screen, r.l.armory.state()?.row]).toEqual(['row', 1]);
    const rows: number[] = [];
    for (let i = 0; i < 60; i++) { r.tick(LOBBY_ARMORY_DIALOG, false, [], DOWN); rows.push(r.l.armory.state()!.row); }
    // The arming waits out the suspension (the dispatch does not run), so the push held through it fires once after.
    expect(rows.indexOf(2)).toBeGreaterThan(10);
    expect(rows.slice(rows.indexOf(2))).toEqual(Array(60 - rows.indexOf(2)).fill(2));
    expect(ARMORY_STICK_ARMING_READING).toMatch(/unsuspended/);
  });

  it('Square stores (CharacterProfile 1, then 3) and Circle clears (7, then 3) the account\'s record; the next opening reads it', async () => {
    const r = rig();
    r.tick('dlgGameLobby.rdr'); await r.settle(); r.tick();
    r.press('CROSS');
    r.press('SQUARE');
    expect(r.modes).toEqual([1, 3]);
    expect(r.record()).toEqual({ charSet: 1, items: [8, 75, 36, 37, 35], valid: true });
    r.press('CIRCLE');
    expect(r.modes).toEqual([1, 3, 7, 3]);
    expect(r.record()?.valid).toBe(false);
  });

  it('DONE and Triangle on character select go back to the lobby (SWITCHMENU dlgGameLobby.rdr) once; the next entry opens afresh', async () => {
    const r = rig();
    r.tick('dlgGameLobby.rdr'); await r.settle(); r.tick();
    const last = r.l.drawList();
    r.press('TRIANGLE');                                                     // returnto_lobby
    // Closed, the switch on the queue: the screen's last frame stays up and takes the pad (nothing reaches the dialog
    // underneath) until the dialog is left.
    expect([r.backs(), r.l.hosting(), r.l.owns(LOBBY_ARMORY_DIALOG), r.l.owns(LOBBY_DIALOG)]).toEqual([1, true, true, false]);
    expect(r.l.drawList().length).toBeGreaterThan(0);
    expect(r.l.drawList().some((i) => i.kind === 'sprite' && i.texture === 'multplay_back.tif')).toBe(last.some((i) => i.kind === 'sprite' && i.texture === 'multplay_back.tif'));
    r.press('CROSS');                                                        // the switch not consumed yet: not opened again
    expect([r.backs(), r.l.hosting()]).toEqual([1, true]);
    r.tick('dlgGameLobby.rdr');
    expect([r.l.hosting(), r.l.drawList()]).toEqual([false, []]);
    r.tick();
    expect(r.l.hosting()).toBe(true);
  });

  it('the pull-out: the dialog\'s UiBackToLobby popup (the clock ticked) shows popup 47 over the screen, which then takes no input; its SWITCHMENU closes it', async () => {
    const r = rig();
    r.tick('dlgGameLobby.rdr'); await r.settle(); r.tick();
    r.set('ArmoryClock', 5); r.set('mp_x_sec_clock', 4);
    r.tick(LOBBY_ARMORY_DIALOG, true);
    expect(r.l.armory.state()?.pulledAt).not.toBe(null);
    expect(r.sounds.at(-1)).toBe('.METAL');                                 // PopUpDialog's
    r.press('CROSS');
    expect(r.l.armory.state()?.screen).toBe('select');                       // the popup takes everything (FUN_00368650)
    r.tick('dlgGameLobby.rdr');                                              // TakenBack, SWITCHMENU: the dialog's own
    expect([r.l.hosting(), r.backs()]).toEqual([false, 0]);
  });

  it("reads the lobby's valves without making or promoting them: no player_team is no side; the TEMP ArmoryClock stays TEMP", async () => {
    const none = rig({ team: null });
    none.tick('dlgGameLobby.rdr'); await none.settle(); none.tick();
    expect([none.l.hosting(), none.valves.find('player_team'), none.valves.find('EQlimit')]).toEqual([false, undefined, undefined]);
    const r = rig();
    r.tick('dlgGameLobby.rdr'); await r.settle(); r.tick();
    expect(r.valves.find('EQlimit')).toBe(undefined);                       // the open read it as 0, made nothing
    r.valves.set('ArmoryClock', 5, VALVE_TYPE.TEMP); r.set('mp_x_sec_clock', 4);   // UiBackToLobby's copy, the script's TEMP
    r.tick(LOBBY_ARMORY_DIALOG, true);
    expect([r.l.armory.state()?.pulledAt !== null, r.valves.find('ArmoryClock')?.type]).toEqual([true, VALVE_TYPE.TEMP]);
  });

  it('another popup of the dialog (a network error): the screen is handed back to the dialog until it is left', async () => {
    const r = rig();
    r.tick('dlgGameLobby.rdr'); await r.settle(); r.tick();
    r.tick(LOBBY_ARMORY_DIALOG, true);                                       // ArmoryClock == mp_x_sec_clock: not the pull-out
    expect([r.l.hosting(), r.l.owns(LOBBY_ARMORY_DIALOG), r.backs()]).toEqual([false, false, 0]);
    r.tick();
    expect(r.l.hosting()).toBe(false);
    r.tick('dlgGameLobby.rdr'); r.tick();
    expect(r.l.hosting()).toBe(true);
  });

  it("opens on the choice made earlier in the session, not on stale valves; and on the account's stored record (CUSTOM)", async () => {
    const r = rig();
    r.set('MpCharSet', 1);                                                   // valves the session left: not a kit (all 0)
    r.tick('dlgGameLobby.rdr'); await r.settle(); r.tick();
    expect(r.l.armory.state()?.kits[0]).toEqual([57, 15, 121, 126, 194]);    // the type's own kit, not five empties
    r.press('RIGHT'); r.press('CROSS');                                      // SEAL 2 committed: held
    r.press('TRIANGLE');                                                     // the confirm opens; the dialog is then left
    r.tick('dlgGameLobby.rdr'); r.tick();
    expect(r.l.armory.state()?.applied?.type).toBe(1);                       // the session's SEAL 2 held
    expect(r.l.armory.uivar('GAMENAMEVAR')).toBe('GAME');
    expect(r.l.armory.uivar('MEDIUS_LOBBY_NAME')).toBe('LOCAL');
  });
});

// ---- the session: the machine builds the disc's dialog, the shared screen takes it over -----------------------------

const NAMES = ['NA', '.DINK'];
const SETS: ZAnimRtSet[] = [{ name: 'test.rdr', anims: [animation('beep', NAMES, [], [sound(NAMES, '.DINK', 0x80)])] }];
const design = (bindings: DialogDesign['bindings'] = []): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null, bindings,
  controls: [], objects: [], scripts: ['test.rdr'], models: [], dropped: [],
});
const DIALOGS: Record<string, DialogDesign> = {
  [LOBBY_DIALOG]: design(),
  [LOBBY_ARMORY_DIALOG]: design([{ kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'beep', argument: null }]),
};

describe('the session hosts the shared ARMORY on the lobby\'s dlg_equipment_mp.rdr (FrontEndSession armory)', () => {
  it('draws the shared screen, mutes the dialog\'s own sounds, takes the pad, and goes back to the lobby on Triangle', async () => {
    const heard: string[] = [], args: unknown[] = [];
    const cues = {
      sound: (c: { sound: string }) => { heard.push(`dialog ${c.sound}`); }, play: (n: string, a: unknown) => { heard.push(`armory ${n}`); args.push(a); },
      popup: () => { heard.push('popup'); }, selection: () => { heard.push('selection'); }, back: () => { heard.push('back'); },
      teletype: () => {}, keyboard: () => {}, stopInstance: () => {}, entries: () => ({}),
    } as unknown as UiSoundCues;
    const s = new FrontEndSession({
      disc: { dialog: (n) => DIALOGS[n] ?? null, sets: SETS, faces: [], captions: null, loader: {}, missing: [] },
      startDialog: LOBBY_DIALOG, sounds: cues, armory: { load: () => Promise.resolve(DATA) },
    });
    vi.spyOn(s.gameLobby.commands, 'missionName').mockReturnValue('mp2');
    s.opener.valves.acquire('player_team', VALVE_TYPE.PERM);
    let down: PadSlotName[] = [];
    s.input.source = { read: () => ({ ...NO_PAD, down: new Set(down) }) };
    const clock = { t: 0 };
    const run = (n: number): void => { for (let i = 0; i < n; i++) { clock.t += 1000 * UI_TICK_SECONDS + 0.01; s.advance(clock.t); } };
    s.advance(0);
    run(3);
    await new Promise((r) => setTimeout(r, 0));
    s.machine.queue.switchMenu(LOBBY_ARMORY_DIALOG);                         // the lobby's weaponselect CROSS
    run(4);
    expect(s.machine.shell()?.currentName).toBe(LOBBY_ARMORY_DIALOG);
    expect(s.lobbyArmory?.hosting()).toBe(true);
    expect(s.last.some((i) => i.kind === 'sprite' && i.texture === 'multplay_back.tif')).toBe(true);
    expect(heard).toEqual(['armory .DINK']);                                 // the dialog's ONSTART .DINK muted; the screen's own
    expect(args).toEqual([{ volume: 0.5, pan: 64, pitchMod: 0 }]);           // at the SOUND's own volume and pan, as the dialog's played
    // The control: without the shared screen, the same dialog's ONSTART is heard (the dialog's own sounds).
    const plain = new FrontEndSession({ disc: { dialog: (n) => DIALOGS[n] ?? null, sets: SETS, faces: [], captions: null, loader: {}, missing: [] }, startDialog: LOBBY_ARMORY_DIALOG, sounds: cues });
    heard.length = 0;
    plain.advance(0);
    for (let i = 1; i <= 4; i++) plain.advance(i * (1000 * UI_TICK_SECONDS + 0.01));
    expect([heard, plain.lobbyArmory]).toEqual([['dialog .DINK'], null]);
    heard.length = 0;
    // returnto_lobby: the shared screen's last frame stays up until SWITCHMENU has left the dialog -- never a frame of
    // the disc's own dlg_equipment_mp.rdr (the generic runtime's, without the images) in between.
    const frames: [string | undefined, boolean][] = [];
    down = ['TRIANGLE'];
    for (let i = 0; i < 6; i++) { run(1); down = []; frames.push([s.machine.shell()?.currentName, s.last.some((x) => x.kind === 'sprite' && x.texture === 'multplay_back.tif')]); }
    expect(frames.filter(([d]) => d === LOBBY_ARMORY_DIALOG).every(([, shared]) => shared)).toBe(true);
    expect(frames.some(([d]) => d === LOBBY_DIALOG)).toBe(true);
    expect(s.machine.shell()?.currentName).toBe(LOBBY_DIALOG);
    expect(s.lobbyArmory?.hosting()).toBe(false);
  });
});

// AM-2 (research 340 §2.2): the disc's own layout -- the fixture's byte copy of `RUN/UI/READERC.ZAR` (MANIFEST.json).
const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const READERC = resolve(FIXTURES, 'RUN/UI/READERC.ZAR');
describe.skipIf(!existsSync(READERC))(`AM-2: the disc's ${LOBBY_ARMORY_DIALOG} takes the stick as a dialog does${existsSync(READERC) ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("its d-pad bindings are its BUTTON controls' UP, DOWN, LEFT and RIGHT, every one FALLING (no STATE); the screen binds none", () => {
    const z = Zar.parse(new Uint8Array(readFileSync(READERC)));
    const key = z.root.children.find((k) => k.name.toLowerCase() === LOBBY_ARMORY_DIALOG.toLowerCase())!;
    const d = loadDialog(parseRdr(z.data(key)));
    const DPAD = new Set([DIALOG_BUTTONS.UP, DIALOG_BUTTONS.DOWN, DIALOG_BUTTONS.LEFT, DIALOG_BUTTONS.RIGHT]);
    const dpad = (bs: readonly { kind: string; code: number; state: number; name: string | null }[]) =>
      bs.filter((b) => b.kind === 'button' && DPAD.has(b.code)).map((b) => [b.name, b.state] as const).sort();
    expect(dpad(d.bindings)).toEqual([]);                                     // the screen: TRIANGLE (returnto_lobby) and events only
    // Its other controls (the windows, images and texts under CONTROLS) bind no button.
    const controls = Object.fromEntries(d.controls.flatMap((c) => (c.widget.type === 'BUTTON' ? [[c.name, dpad(c.widget.button.bindings)]] : [])));
    const all = [['DOWN', DIALOG_BUTTON_STATES.FALLING], ['LEFT', DIALOG_BUTTON_STATES.FALLING], ['RIGHT', DIALOG_BUTTON_STATES.FALLING], ['UP', DIALOG_BUTTON_STATES.FALLING]];
    expect(controls).toEqual({ EquipMpTerrBtn: all, EquipMpSealBtn: all, EquipMPDoneBtn: [['DOWN', 1], ['UP', 1]], EquipWeaponBtn: all });
  });
});

// ---- OBF-2 (OBF.R2): one ARMORY and one listener over a match's whole life ------------------------------------------

/**
 * The counting test of OBF-2 (the plan `docs/plans/2026-10-30-overnight-bugfix.md`): the front end's page drives its
 * session through a match's life -- the lobby, the ARMORY, a launch, the match, the return, the ARMORY again, a second
 * match in the same page, a late join -- with a pad (an Xbox and a PlayStation pad, both as Chromium maps them, through
 * the page's `GamePad`) and with the keyboard, and at every step counts what reaches the shared screen: one pad read per
 * menu read (`LobbyArmory.pad`, the screen's one listener), one step per press (`Armory.input`), nothing while the match
 * is up (the menus held, `matchMenuHold`), and the one `Armory` of the session. A late joiner's launch runs inside the
 * menus' frame -- `ReadyToLoad` (`FUN_0027caf0` D:L125606-125608) is a dialog command the machine's tick runs -- and that
 * is the path the page's hold had to survive.
 */
type LifeDevice = { name: string; id: string | null };
const LIFE_DEVICES: LifeDevice[] = [
  { name: 'an Xbox pad', id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)' },
  { name: 'a PlayStation pad', id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)' },
  { name: 'the keyboard', id: null },
];
const LIFE_KEYS: Partial<Record<PadButton, string>> = { Down: 'ArrowDown', Up: 'ArrowUp', Triangle: 'Backspace', Cross: 'Enter' };

describe('OBF-2: one ARMORY and one listener over a match\'s whole life (the front end\'s page)', () => {
  it.each(LIFE_DEVICES)('with $name: one step per press at every ARMORY, nothing in the match, through launches, returns and late joins', async (device) => {
    const s = new FrontEndSession({
      disc: { dialog: (n) => DIALOGS[n] ?? null, sets: SETS, faces: [], captions: null, loader: {}, missing: [] },
      startDialog: LOBBY_DIALOG, armory: { load: () => Promise.resolve(DATA) },
    });
    vi.spyOn(s.gameLobby.commands, 'missionName').mockReturnValue('mp2');
    s.opener.valves.acquire('player_team', VALVE_TYPE.PERM);
    // The physical pad, as `navigator.getGamepads()` lists it, through the page's `GamePad` (`./menuInput` `attachMenuInput`).
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    const raw: PadLike = { id: device.id ?? '', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons };
    const nav: PadSource = { getGamepads: () => (device.id ? [raw] : []) };
    const gp = new GamePad({ wanted: null, releaseCrouch: false });
    const page = new MenuPageInput(() => { const p = gp.poll(nav); return p ? [p] : []; });
    // The machine's tick: a command it runs (the late joiner's ReadyToLoad) is run inside its pad read's frame here.
    let inFrame: (() => void) | null = null;
    s.input.source = { read: () => { const f = inFrame; inFrame = null; f?.(); return page.read(); } };
    const hold = matchMenuHold(() => s);
    const host = s.lobbyArmory!;
    const armory = host.armory;
    let pads = 0, live = 0, steps = 0;
    const pad = host.pad.bind(host);
    host.pad = (snap) => { pads++; if (snap && snap.down.size > 0) live++; pad(snap); };
    const input = armory.input.bind(armory);
    armory.input = (i) => { steps++; return input(i); };
    const clock = { t: 0 };
    let ticks = 0;
    const run = (n: number): void => { for (let i = 0; i < n; i++) { clock.t += 1000 * UI_TICK_SECONDS + 0.01; ticks += s.advance(clock.t); } };
    const set = (b: PadButton, on: boolean): void => {
      if (device.id) buttons[PAD_BUTTON[b]] = { pressed: on, value: on ? 1 : 0 };
      else if (on) page.keyDown(LIFE_KEYS[b]!); else page.keyUp(LIFE_KEYS[b]!);
    };
    /** One press as a hand makes it: held across several of the menus' reads, then let go. */
    const press = (b: PadButton): void => { set(b, true); run(5); set(b, false); run(12); };
    /**
     * What one step of the life did: the steps the screen took, whether every menu read was handed to the screen once, and
     * how many of those reads held a button (the match's own, which the menus must not see while it is up).
     */
    const step = (fn: () => void): { steps: number; once: boolean; live: number } => {
      const s0 = steps, p0 = pads, t0 = ticks, l0 = live;
      fn();
      return { steps: steps - s0, once: pads - p0 === ticks - t0, live: live - l0 };
    };
    const atArmory = (): void => { s.machine.queue.switchMenu(LOBBY_ARMORY_DIALOG); run(4); };   // the lobby's weaponselect CROSS
    const life: [string, unknown, unknown][] = [];
    const expectArmory = (label: string): void => {
      life.push([`${label}: the ARMORY up`, [s.machine.shell()?.currentName, host.hosting(), armory.isOpen(), s.lobbyArmory === host], [LOBBY_ARMORY_DIALOG, true, true, true]]);
      const one = (b: PadButton): { steps: number; once: boolean } => { const { steps: n, once } = step(() => press(b)); return { steps: n, once }; };
      life.push([`${label}: Down once`, one('Down'), { steps: 1, once: true }]);
      life.push([`${label}: Down once more`, one('Down'), { steps: 1, once: true }]);
      life.push([`${label}: Triangle once, back to the lobby`, one('Triangle'), { steps: 1, once: true }]);
      life.push([`${label}: in the lobby`, [s.machine.shell()?.currentName, host.hosting(), armory.isOpen()], [LOBBY_DIALOG, false, false]]);
    };
    /** The match up: every button the page reads is the match's, none the menus' (nor the ARMORY's). */
    const inMatch = (label: string): void => {
      life.push([`${label}: the match holds the menus`, step(() => { press('Down'); press('Triangle'); press('Cross'); }), { steps: 0, once: true, live: 0 }]);
    };

    s.advance(0);
    run(3);
    await new Promise((r) => setTimeout(r, 0));                              // the mission's ARMORY read lands
    // The lobby, the ARMORY before the first launch.
    atArmory();
    expectArmory('before the first match');
    // Round 1 of a match launched from the lobby's socket (outside the menus' frame), its rounds, its return.
    hold.leave(); run(2);
    inMatch('match 1');
    hold.returned(); run(2);
    atArmory();
    expectArmory('after match 1');
    // A late join (or a rejoin): the hand-off from the lobby's ReadyToLoad, inside the menus' frame.
    inFrame = () => { hold.leave(); }; run(2);
    inMatch('match 2, joined late');
    hold.returned(); run(2);
    atArmory();
    expectArmory('after match 2 (joined late)');
    // The next map of the play list, and another late join in the same page.
    hold.leave(); run(2);
    inMatch('match 3');
    hold.returned(); run(2);
    inFrame = () => { hold.leave(); }; run(2);
    inMatch('match 4, joined late');
    hold.returned(); run(2);
    atArmory();
    expectArmory('after match 4 (joined late)');
    // Every step as it should be; a step that is not is listed with what it did (the life's whole record in one line each).
    const wrong = life.filter(([, got, want]) => JSON.stringify(got) !== JSON.stringify(want)).map(([l, got]) => `${l}: ${JSON.stringify(got)}`);
    expect(wrong).toEqual([]);
    expect(life.length).toBe(4 * 5 + 4);
  });

  it("the menus' source taken inside their own frame and set back later is still one listener (the frame's wrapper is never kept)", async () => {
    const s = new FrontEndSession({
      disc: { dialog: (n) => DIALOGS[n] ?? null, sets: SETS, faces: [], captions: null, loader: {}, missing: [] },
      startDialog: LOBBY_DIALOG, armory: { load: () => Promise.resolve(DATA) },
    });
    vi.spyOn(s.gameLobby.commands, 'missionName').mockReturnValue('mp2');
    s.opener.valves.acquire('player_team', VALVE_TYPE.PERM);
    let down: PadSlotName[] = [];
    let grab = false;
    let kept: typeof s.input.source | null = null;
    s.input.source = { read: () => { if (grab) { grab = false; kept = s.input.source; } return { ...NO_PAD, down: new Set(down) }; } };
    const host = s.lobbyArmory!;
    let steps = 0;
    const input = host.armory.input.bind(host.armory);
    host.armory.input = (i) => { steps++; return input(i); };
    const clock = { t: 0 };
    const run = (n: number): void => { for (let i = 0; i < n; i++) { clock.t += 1000 * UI_TICK_SECONDS + 0.01; s.advance(clock.t); } };
    s.advance(0); run(3);
    await new Promise((r) => setTimeout(r, 0));
    s.machine.queue.switchMenu(LOBBY_ARMORY_DIALOG); run(4);
    expect(host.hosting()).toBe(true);
    grab = true; run(1);                                                     // a part of the page keeps the source it saw mid-frame
    s.input.source = kept!; run(2);                                          // and hands it back after the frame
    down = ['DOWN']; run(5); down = []; run(12);
    expect(steps).toBe(1);                                                   // one press, one step
  });
});
