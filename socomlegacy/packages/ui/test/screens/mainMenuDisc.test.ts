import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { parseAnimSets } from '@s2u/scene';
import { frontEndSoundTable, soundHash } from '@s2u/sound';
import { UI_TICK_SECONDS } from '../../src/clock/uiClock';
import type { UiModelGeometry } from '../../src/compositor/models';
import { MenuInput } from '../../src/input/menuInput';
import { dialogLookup } from '../../src/screens/dialogArchive';
import { DialogPartsHost } from '../../src/screens/dialogParts';
import { FrontEndMachine } from '../../src/screens/frontEndMachine';
import { MenuCommands, type MenuCardIo } from '../../src/screens/menuCommands';
import { PopupSlot } from '../../src/screens/popupSlot';
import { UiSoundCues, type UiSoundOutput } from '../../src/sounds/uiSoundCues';
import { UiCommandHost } from '../../src/uiCommands';
import { UiVarManager } from '../../src/uiVars';
import type { MovieService } from '../../src/movie/movieCommands';
import { textFace } from '../text/fixtures';
import { FRONT_ITEM, ROLLER_FACES } from './mainMenu.test';

/**
 * The main menu over the disc (MENU-02a; a dev-disc test, W6.R8; web research 140 §3): `dlgMenu.rdr` opened on
 * `RUN/UI/READERC.ZAR` and `RUN/UIZANIM.ZAR` with every module of the path in PLAT-08's host, the roller's twelve
 * item nodes stood in by a made-up geometry (one quad a part, the names the file's: `new_on` .. `online_off`), the pad
 * driven through PLAT-11's dispatcher. Walked DOWN as `scripts/parity/menu_explore.txt` walks it (M3): the item order
 * per step, the roller's face, the cues' onsets, EXTRAS' visibility; and a card with a counted save. The disc is
 * `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; with neither (CI) every test skips.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const FILES = ['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR', 'RUN/UIZANIM.ZAR'];
const HAVE_DISC = DISC !== '' && FILES.every((f) => existsSync(join(DISC, f)));
const zar = (p: string): Zar => Zar.parse(new Uint8Array(readFileSync(join(DISC, p))));

const h = (name: string): string => String(soundHash(name));
const SOUND_SCRIPT = ['SETS', ['HUDUI', ['.DINK', '.METAL', '.TCM_SLIDE', '.BACK', '.TYPE'].map((n) => [h(n), 'ONESHOT', []])], 'GROUPS', []];
const ITEMS = ['new', 'load', 'extras', 'options', 'lan', 'online'] as const;
/** The roller's nodes as `UI_GEO.ZED` names them (research 140 §2), each one quad facing +z at its own place. */
const roller = (): UiModelGeometry => ({
  name: 'mainmenu_roller',
  parts: ITEMS.flatMap((i) => [`${i}_on`, `${i}_off`]).map((node) => ({
    node, meshes: [{ positions: new Float32Array([1, 1, 5, -1, 1, 5, -1, -1, 5]), uvs: new Float32Array(6), colors: new Float32Array(12).fill(1), indices: new Uint16Array([0, 1, 2]), texture: `menu_${node}.tif`, cull: true }],
  })),
});

function rig(card?: MenuCardIo) {
  const readerc = zar('RUN/UI/READERC.ZAR'), readerx = zar('RUN/UI/READERX.ZAR');
  const sets = parseAnimSets(zar('RUN/UIZANIM.ZAR')).sets;
  let seed = 1;
  const random = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed; };
  let m!: FrontEndMachine;
  const face = textFace();
  const parts = new DialogPartsHost({ popupObject: () => m.queue.popupObject, face: () => face });
  let cuesRef: UiSoundCues | null = null;
  const host = new UiCommandHost({ node: parts.nodeCommand, sound: (cmd) => { cuesRef?.sound(cmd); } });   // research 122 §6: a script's SOUND to the cues
  const lookup = dialogLookup([readerc, readerx]);
  const input = new MenuInput({ machine: () => m, parts });
  input.register(host);
  input.source = { read: () => ({ down: new Set(), stickX: 0, stickY: 0 }) };
  let t = 0;
  const plays: { name: string; t: number }[] = [];
  const sound: UiSoundOutput = { play(p) { plays.push({ name: p.resolution.name, t: Math.round(t * 1000) / 1000 }); }, stopAll() {}, fadeAll() {}, streaming() {} };
  const cues = new UiSoundCues(frontEndSoundTable(SOUND_SCRIPT as never, new Map([['HUDUI', { names: new Map<string, number>() }]])), { teletype: '.TYPE', back: '.BACK', selection: '.METAL' }, [], sound);
  cuesRef = cues;
  for (const [name, entry] of Object.entries(cues.entries())) host.setHandler(name, (cmd) => entry(cmd));
  const uiVars = new UiVarManager();
  new MenuCommands({ valves: () => m.valves, uiVars, inputString: (cmd) => m.shell()?.inputString(cmd.anim) ?? null, event: (kind) => { m.shell()?.event(kind); }, card }).register(host);
  const slot = new PopupSlot();
  slot.connect(parts.makePopup);
  const movie = { service: { background: { on: () => true, off: () => true }, play: () => {} } as unknown as MovieService, frame: () => 'menu' as const, unload: () => {}, load: () => input.built() };
  const activated: string[] = [];
  m = new FrontEndMachine({
    dialog: lookup, sets, random, host, popups: slot, startDialog: 'dlgMenu.rdr', build: { face: () => face, model: (n) => (n === 'mainmenu_roller' ? roller() : null) },
    built: parts.built, draw: parts.draw, widgetsTick: parts.widgetsTick, setEnabled: parts.setEnabled,
    input: input.dispatch, pad: input.read, activate: (n) => { activated.push(n); input.activate(n); }, movie,
  });
  m.boot();
  const run = (n: number): void => { for (let i = 0; i < n; i++) { m.frame(UI_TICK_SECONDS); t += UI_TICK_SECONDS; } };
  const model = () => m.shell()!.screen.models[0]!;
  const lit = (): string[] => model().parts.filter((p) => p.active && p.name.endsWith('_on')).map((p) => p.name);
  const shown = (): string[] => model().parts.filter((p) => p.active).map((p) => p.name);
  const value = (name: string): number => m.valves.find(name)?.value ?? NaN;
  const press = (name: 'DOWN' | 'UP' | 'CROSS'): void => {
    let frames = 0;
    input.source = { read: () => ({ down: new Set(frames++ === 0 ? [name] : []), stickX: 0, stickY: 0 }) };
    run(1);
    input.source = { read: () => ({ down: new Set(), stickX: 0, stickY: 0 }) };
  };
  return { m, run, model, lit, shown, value, press, plays, activated };
}
const ticks = (seconds: number): number => Math.ceil(seconds / UI_TICK_SECONDS);

describe.skipIf(!HAVE_DISC)(`the main menu over the disc${HAVE_DISC ? '' : ' (no SOCOM_DISC / SOCOM_PC_ROOT)'}`, () => {
  it('ONSTART on the empty card: NEW GAME at the front, its _on quad lit, the five others dim, the roller on face 1, the arrows pulsing', () => {
    const r = rig();
    r.run(ticks(1.0));
    expect(r.value('GotSaveGames')).toBe(0);
    expect(r.value('MenuButtonChanged')).toBe(1);
    expect(r.lit()).toEqual(['new_on']);
    expect(r.shown()).toEqual(['new_on', 'load_off', 'extras_off', 'options_off', 'lan_off', 'online_off']);   // the stand-in geometry's order
    expect(r.model().root.rotation).toEqual([0, 0, 0, 1]);
    expect(r.model().root.active).toBe(true);
    expect(r.activated).toEqual(['new_game_button']);
    const screen = r.m.shell()!.screen;
    const find = (n: string) => { const seek = (x: typeof screen.root): typeof screen.root | null => { if (x.name === n) return x; for (const c of x.children) { const h2 = seek(c); if (h2) return h2; } return null; }; return seek(screen.root)!; };
    expect(find('SavedGames').visible).toBe(false);
    expect(find('LoadGameBack').visible).toBe(false);
    // Two fades run on MENUFADER at once (research 139 §9: `menu_fade_up` 1 -> 0 in 1.5 s and SetMenuValve's 0.99 -> 0
    // in 0.75 s), so the opacity passes 0 at about 0.5 s and sits under it until menu_fade_up writes its 0 at 1.5 s.
    expect(screen.fader.opacity).toBeLessThanOrEqual(0);
    r.run(ticks(0.6));
    expect(screen.fader.opacity).toBe(0);
    expect(find('arrow_up').opacity).toBeGreaterThan(0.2);
    expect(find('arrow_up').opacity).toBeLessThanOrEqual(0.99);
  }, 60_000);

  it('the DOWN walk (menu_explore.txt, M3): NEW GAME, ONLINE, LAN, OPTIONS, EXTRAS, LOAD GAME, NEW GAME; EXTRAS is on the drum\'s back until LOAD GAME or OPTIONS is at the front', () => {
    const r = rig();
    r.run(ticks(1.0));
    const walk: string[] = [FRONT_ITEM[r.value('MenuButtonChanged')]!];
    for (let i = 0; i < 6; i++) {
      r.press('DOWN');
      r.run(ticks(0.4));
      const k = r.value('MenuButtonChanged');
      walk.push(FRONT_ITEM[k]!);
      expect(r.lit(), `step ${i + 1}`).toEqual([`${FRONT_ITEM[k]}_on`]);
      ROLLER_FACES[k]!.forEach((v, j) => expect(r.model().root.rotation[j], `step ${i + 1} q[${j}]`).toBeCloseTo(v, 4));
      expect(r.activated[r.activated.length - 1]).toBe({ new: 'new_game_button', load: 'load_game_button', extras: 'Extras_button', options: 'options_button', lan: 'LAN_button', online: 'multiplayer_button' }[FRONT_ITEM[k]!]);
    }
    expect(walk).toEqual(['new', 'online', 'lan', 'options', 'extras', 'load', 'new']);
    // EXTRAS' quad is always shown (every _off is); it faces the camera only within 60 degrees of the front: faces 2 and 4.
    const front = (k: number): number[] => ROLLER_FACES[k]!;
    const angle = (q: number[]): number => 2 * Math.atan2(q[0]!, q[3]!) * (180 / Math.PI);
    const visibleAt = [1, 2, 3, 4, 5, 6].filter((k) => Math.abs(((angle(front(k)) - 120 + 540) % 360) - 180) <= 60.01);
    expect(visibleAt).toEqual([2, 3, 4]);
  }, 60_000);

  it('the cues of a step: .TCM_SLIDE and .METAL together, .METAL 0.15 s on, .TCM_SLIDE 0.30, .METAL 0.45 -- through PLAT-23\'s host; no music', () => {
    const r = rig();
    r.run(ticks(1.0));
    r.plays.length = 0;
    r.press('DOWN');
    r.run(ticks(0.6));
    const names = r.plays.map((p) => p.name);
    expect(names.filter((n) => n === h('.TCM_SLIDE') || n === '.TCM_SLIDE')).toHaveLength(2);
    expect(names.filter((n) => n === h('.METAL') || n === '.METAL')).toHaveLength(3);
    const t0 = r.plays[0]!.t;
    expect(r.plays.map((p) => Math.round((p.t - t0) / 0.15))).toEqual([0, 0, 1, 2, 3]);
    expect(names.some((n) => /MUS_/.test(n))).toBe(false);
  }, 60_000);

  it('a card with a counted save (zSaveHeader text "m..."): LOAD GAME at the front (GotSaveGames 1 -> MenuButtonChanged 2)', () => {
    const card: MenuCardIo = {
      getInfo: () => ({ result: 0, type: 2, format: 1 }),
      getDir: (_p, _s, path) => ({ result: path === 'SaveGame0' || path === 'BASCUS-97275SOCOMII' ? 1 : 0 }),
      chdir: () => ({ result: 0 }), mkdir: () => 0, saveHeaderText: (_p, _s, path) => (path === 'SaveGame0' ? 'mission 51' : null),
    };
    const r = rig(card);
    r.run(ticks(1.0));
    expect(r.value('GotSaveGames')).toBe(1);
    expect(r.value('MenuButtonChanged')).toBe(2);
    expect(r.lit()).toEqual(['load_on']);
    expect(r.activated).toEqual(['load_game_button']);
  }, 60_000);

  it('CROSS on NEW GAME (UiprepMission1, three sequences at once): .DINK (flags 0x82), new_on swelling to 1.6 and fading to 0 in 0.1 s, the Roller and the arrows hidden, SuspendMenuInput 1.75, SWITCHMENU dlgSelectRank.rdr stored and landed after the fade', () => {
    const r = rig();
    r.run(ticks(1.0));
    r.plays.length = 0;
    const screen = r.m.shell()!.screen;
    const newOn = r.model().parts.find((p) => p.name === 'new_on')!;
    const find = (n: string) => { const seek = (x: typeof screen.root): typeof screen.root | null => { if (x.name === n) return x; for (const c of x.children) { const h2 = seek(c); if (h2) return h2; } return null; }; return seek(screen.root)!; };
    r.press('CROSS');
    expect(r.plays.map((p) => p.name)).toEqual(['.DINK']);                       // not .METAL: PLAT-23's selection cue is the code side's, the set plays .DINK
    expect(r.m.shell()!.currentName).toBe('dlgSelectRank.rdr');                   // the switch stored (FUN_00365a00: the countdown starts, the fader rises)
    expect(r.m.shell()!.screen).toBe(screen);                                     // the menu still built: its nodes finish their animations under the fader
    expect(r.value('CameFromDebriefing')).toBe(1);
    expect(r.value('DontSetMission')).toBe(0);
    r.run(ticks(0.1));
    expect(newOn.scale.map((v) => Math.round(v * 100) / 100)).toEqual([1.6, 1.6, 1.6]);
    expect(newOn.opacity).toBe(0);
    expect(r.model().root.active).toBe(false);
    expect(find('arrow_up').visible).toBe(false);
    expect(find('arrow_dwn').visible).toBe(false);
    r.press('DOWN');                                                              // inside SuspendMenuInput 1.75: lost
    r.run(ticks(0.2));
    expect(r.value('MenuButtonChanged')).toBe(1);
    expect(r.plays.map((p) => p.name)).toEqual(['.DINK']);
    r.run(ticks(1.0));
    expect(r.m.shell()!.screen).not.toBe(screen);                                 // landed: dlgSelectRank built
    expect(r.m.shell()!.currentName).toBe('dlgSelectRank.rdr');
  }, 60_000);

  it('CROSS on ONLINE (do_multi_or_medius): ComeFromLan 0, .DINK, online_on to 1.6 and faded in 0.15 s, CurrentMission 0, SWITCHMENU dlgMPswitch.rdr', () => {
    const r = rig();
    r.run(ticks(1.0));
    r.press('DOWN');
    r.run(ticks(0.7));                                                            // the turn and its four cues over
    expect(r.lit()).toEqual(['online_on']);
    const onlineOn = r.model().parts.find((p) => p.name === 'online_on')!;
    r.plays.length = 0;
    r.press('CROSS');
    expect(r.plays.map((p) => p.name)).toEqual(['.DINK']);
    expect(r.m.shell()!.currentName).toBe('dlgMPswitch.rdr');
    expect(r.value('ComeFromLan')).toBe(0);
    expect(r.value('CurrentMission')).toBe(0);
    r.run(ticks(0.1));
    expect(onlineOn.scale[0]).toBeLessThan(1.6);                                  // 0.15 s here, not 0.1
    expect(onlineOn.opacity).toBeGreaterThan(0);
    r.run(ticks(0.1));
    expect(onlineOn.scale[0]).toBeCloseTo(1.6, 1);                              // 1.594 by the runtime's float stepping over 0.15 s (PLAT-07's), not 1.6 exactly
    expect(onlineOn.opacity).toBeCloseTo(0, 1);
    expect(r.model().root.active).toBe(false);
  }, 60_000);
});
