// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Zar, type AssetSource } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { frontEndSoundTable, soundHash, type SoundBank } from '@s2u/sound';
import {
  MOVIE_COMMAND_ROWS, SCREEN_COMMAND_ROWS, SlotPopup, UI_COMMAND_TABLE, UI_SOUND_COMMAND_ROWS, UI_TICK_SECONDS, UiSoundCues, type DialogDesign, type UiDrawItem,
  type ZAnimRtSet, type ZAnimUiCommand,
} from '@s2u/ui';
import { GameAudio, type AudioOut } from '../src/audio';
import { FrontEndSession, mountFrontEnd, readFrontEndDisc, type FrontEndDisc } from '../src/frontEnd';
import { uiSoundOutput } from '../src/uiSoundHost';
import { animation, popupRecord, sound, uiFn } from '../../ui/test/screens/zanimAsm';
import { buildIso } from '../../archive/test/isoImage';

/**
 * Sprint 9's connecting lines on the page (S9-WIRE; the sprint 9 plan's W9.R4 and "Where two tasks meet"): what
 * `FrontEndSession` hands each merged module -- PLAT-16's popup in PLAT-10's overlay slot, PLAT-23's sound host behind
 * the command host. Synthetic dialogs and animations run by the session's own clock; nothing measured on the original
 * running.
 */

const NAMES = ['NA', 'PopUpDialog', 'KillPopUp', 'popupOp.tif', 'Quit?', 'ANSWER', '.DINK', 'StopAllSounds'];
const SETS: ZAnimRtSet[] = [{
  name: 'test.rdr',
  anims: [
    animation('show', NAMES, ['POPUP'], [
      popupRecord(NAMES, 1, { text: 'Quit?', panel: 'popupOp.tif', x: 150, y: 180, w: 340, h: 130, valve: 'ANSWER' }),
      uiFn(NAMES, 'PopUpDialog'),
    ]),
    animation('beep', NAMES, [], [sound(NAMES, '.DINK', 0x80)]),
  ],
}];
const design = (over: Partial<DialogDesign> = {}): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null,
  bindings: [{ kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'show', argument: null }],
  controls: [], objects: [], scripts: ['test.rdr'], models: [], dropped: [], ...over,
});
const disc = (d: (name: string) => DialogDesign | null = (n) => (n === 'dlgMenu.rdr' ? design() : null)): FrontEndDisc =>
  ({ dialog: d, sets: SETS, faces: [], captions: null, loader: {}, missing: [] });

/** The session advanced `n` ticks of its clock. */
function run(s: FrontEndSession, n: number, from = { t: 0 }): void {
  if (from.t === 0) s.advance(0);
  for (let i = 0; i < n; i++) { from.t += 1000 * UI_TICK_SECONDS + 0.01; s.advance(from.t); }
}
const cmd = (fn: string, arg = 'NA'): ZAnimUiCommand =>
  ({ anim: 'show', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });
const onPopup = (items: UiDrawItem[]): UiDrawItem[] => items.filter((i) => 'node' in i && i.node === 'POPUP');

describe('the session connects PLAT-16\'s popup to PLAT-10\'s overlay slot (session.popups)', () => {
  it('PopUpDialog shows the real component over the dialog, last in the frame; KillPopUp removes it', () => {
    const s = new FrontEndSession({ disc: disc(), startDialog: 'dlgMenu.rdr' });
    const clock = { t: 0 };
    run(s, 4, clock);
    expect(s.machine.queue.popupObject).toBeInstanceOf(SlotPopup);
    const shown = onPopup(s.last);
    expect(shown[0]).toMatchObject({ kind: 'sprite', texture: 'popupOp.tif', x0: 150, y0: 180, x1: 490, y1: 310 });
    expect(s.last.at(-1)).toMatchObject({ node: 'POPUP' });
    expect(s.host.dispatch(cmd('KillPopUp')).kind).toBe('table');
    run(s, 1, clock);
    expect(onPopup(s.last)).toEqual([]);
  });
});

/** PLAT-23's cues over HUDUI's two names and a page audio that records what reaches it (`uiSoundHost.ts`'s output). */
function sounds() {
  const heard: string[] = [];
  const h = (n: string): string => String(soundHash(n));
  const table = frontEndSoundTable(['SETS', ['HUDUI', [[h('.DINK'), 'ONESHOT', []], [h('.BACK'), 'ONESHOT', []], [h('.METAL'), 'ONESHOT', []]]]],
    new Map([['HUDUI', { names: new Map([['.DINK', 0], ['.BACK', 1], ['.METAL', 2]]) } as unknown as SoundBank]]));
  const out = uiSoundOutput({ play: (name) => { heard.push(name); return true; }, stopMusic: () => { heard.push('stopMusic'); } });
  return { heard, cues: new UiSoundCues(table, { teletype: '', back: '.BACK', selection: '.DINK' }, [], out) };
}

describe("the session hands PLAT-23's sound host to the command host (session option sounds)", () => {
  it("a dialog's SOUND command reaches the host: the zAnim host's sound is the cues'", () => {
    const { heard, cues } = sounds();
    const beep = design({ bindings: [{ kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'beep', argument: null }] });
    const s = new FrontEndSession({ disc: disc((n) => (n === 'dlgMenu.rdr' ? beep : null)), startDialog: 'dlgMenu.rdr', sounds: cues });
    run(s, 4);
    expect(heard).toEqual(['.DINK']);
  });

  it("PopUpDialog's .METAL and SwitchMenu PREVIOUS_SCREEN's BACK are the cues' popup() and back()", () => {
    const { heard, cues } = sounds();
    const s = new FrontEndSession({ disc: disc(), startDialog: 'dlgMenu.rdr', sounds: cues });
    run(s, 4);
    expect(heard).toEqual(['.METAL']);                            // the show animation's PopUpDialog (FUN_0027eff0)
    s.host.dispatch(cmd('SwitchMenu', 'PREVIOUS_SCREEN'));
    expect(heard).toEqual(['.METAL', '.BACK']);                    // FUN_0027e720 D:L126591-126598
  });

  // PF-32 (research 233 s3, s6 line 2): the command host passes an animation instance's end to the cues, whose 0x200
  // name slot's voice stops (or fades, +4) with it (`STOP_ON_EXIT_FLAG_READING`; `FUN_0026fd20` D:L118572).
  it("PF-32: an animation instance's end reaches the cues' stopInstance through the command host (UiCommandHost instanceStop)", () => {
    const { cues } = sounds();
    const stopped: string[] = [];
    const stop = cues.stopInstance.bind(cues);
    cues.stopInstance = (anim: string): void => { stopped.push(anim); stop(anim); };
    const beep = design({ bindings: [{ kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'beep', argument: null }] });
    const s = new FrontEndSession({ disc: disc((n) => (n === 'dlgMenu.rdr' ? beep : null)), startDialog: 'dlgMenu.rdr', sounds: cues });
    expect(s.host.instanceStop).toBeTypeOf('function');
    run(s, 8);
    expect(stopped).toContain('beep');
    expect(new FrontEndSession({ disc: disc(), startDialog: 'dlgMenu.rdr' }).host.instanceStop).toBeUndefined();   // no cues: none
  });
});

describe("PLAT-08's host command table is a registry each module fills (W9.R4's second case): every row with an entry is bound", () => {
  /** The rows the merged modules implement, with their table index (`readBindingTable`'s), and who binds each. */
  const ROWS = [
    ...SCREEN_COMMAND_ROWS.map((r) => ({ ...r, by: 'FrontEndMachine.boot (ScreenCommands.register)' })),
    ...MOVIE_COMMAND_ROWS.map((r) => ({ ...r, by: 'FrontEndSession (MovieCommands.entries)' })),
    ...UI_SOUND_COMMAND_ROWS.map((r) => ({ ...r, by: 'FrontEndSession (UiSoundCues.entries)' })),
  ];

  it("lists 18 rows, each the table's own index and name", () => {
    expect(ROWS).toHaveLength(18);
    for (const r of ROWS) expect(UI_COMMAND_TABLE[r.row], r.name).toMatchObject({ index: r.row, id: r.id, name: r.name, fn: r.fn });
  });

  it('a session with the sound host answers each from its module, none as not implemented', () => {
    const { heard, cues } = sounds();
    const s = new FrontEndSession({ disc: disc(), startDialog: 'dlgMenu.rdr', sounds: cues });
    run(s, 4);
    const kinds = Object.fromEntries(ROWS.map((r) => [r.name, s.host.dispatch(cmd(r.name)).kind]));
    expect(Object.entries(kinds).filter(([, k]) => k !== 'table')).toEqual([]);
    expect(heard).toContain('stopMusic');                          // StopAllSounds reached the page's audio
  });
});

describe("a pushed movie covers the menu state: its OnCover stops the dialog's background movie (FUN_00366b10)", () => {
  it('BACKGROUND TYPE MPEG is closed while PlayMPEG\'s movie runs, and restarted at its pop (OnPop, FUN_001f45e0)', () => {
    const mpeg = design({ background: { type: 2, typeName: 'MPEG_LOOPING', filename: 'run/movies/common/menuloop.pss' }, bindings: [] });
    const s = new FrontEndSession({ disc: disc((n) => (n === 'dlgMenu.rdr' ? mpeg : null)), startDialog: 'dlgMenu.rdr' });
    const clock = { t: 0 };
    run(s, 3, clock);
    expect(s.movie.background.state).toBe('PLAYING');
    const bytes = new Uint8Array(0x44);
    expect(s.host.dispatch({ ...cmd('PlayMPEG', 'NA'), arg: 'run/movies/intro_2.pss', bytes }).kind).toBe('table');
    run(s, 1, clock);                                             // the push applied: OnCover, then the movie's init
    expect(s.movie.moviePlaying).toBe(true);
    expect(s.movie.background.state).not.toBe('PLAYING');
    for (let i = 0; i < 4000 && s.movie.moviePlaying; i++) run(s, 1, clock);
    expect(s.movie.moviePlaying).toBe(false);
    expect(s.movie.background.state).toBe('PLAYING');            // FUN_00366a00(G, 0) at the pop
  });
});

describe("PLAT-15's widgets in the session's frames: the widgets' cues reach the sound host", () => {
  it('a BUTTON draws as its quads, never a widget item; its SELECTION is the cues\' selection()', () => {
    const { heard, cues } = sounds();
    const button = design({
      bindings: [],
      controls: [{
        name: 'b', type: 'BUTTON', x: 100, y: 200, opacity: 1, childOf: null,
        widget: {
          type: 'BUTTON', uivar: null,
          button: {
            size: [120, 30], offset: [0, 0], scale: 1, caption: null, hcentered: false, font: null, bindings: [],
            normal: { block: true, image: 'n.tif', textColor: [128, 128, 128], pulse: 0, scale: 1, glow: null },
            active: { block: true, image: 'a.tif', textColor: [128, 128, 128], pulse: 0, scale: 1, glow: null },
            pressed: { block: true, image: 'p.tif', textColor: [128, 128, 128], pulse: 0, scale: 1, glow: null },
            disabled: { block: true, image: 'd.tif', textColor: [128, 128, 128], pulse: 0, scale: 1, glow: null },
          },
        },
      }],
    });
    const s = new FrontEndSession({ disc: disc((n) => (n === 'dlgMenu.rdr' ? button : null)), startDialog: 'dlgMenu.rdr', sounds: cues });
    run(s, 3);
    expect(s.last.filter((i) => i.kind === 'widget')).toEqual([]);
    // The ring's one control, focused and activated at the build (PLAT-11, D:L263735-263745): its ACTIVE body.
    expect(s.last.find((i) => i.kind === 'sprite' && i.node === 'b')).toMatchObject({ texture: 'a.tif', x0: 100, y0: 200, x1: 220, y1: 230 });
    s.parts.current!.widgetHost.sound('SELECTION');
    expect(heard).toEqual(['.DINK']);
  });
});

// The dev disc (W6.R8): `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; skipped without one.
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && existsSync(join(DISC, 'RUN/UI/READERC.ZAR'));

describe.skipIf(!HAVE_DISC)('the connected front end over the disc (SOCOM_DISC)', () => {
  it('every dialog of READERC and READERX runs 30 frames with its widgets and popup: no widget item is left undrawn', async () => {
    const d = await readFrontEndDisc(new FsAssetSource(DISC));
    const readerc = Zar.parse(new Uint8Array(readFileSync(join(DISC, 'RUN/UI/READERC.ZAR'))));
    const readerx = Zar.parse(new Uint8Array(readFileSync(join(DISC, 'RUN/UI/READERX.ZAR'))));
    const names = [...readerc.root.children, ...readerx.root.children].map((k) => k.name);
    expect(names).toHaveLength(114);
    const left = new Map<string, number>();
    let popups = 0, drawnWidgets = 0;
    for (const name of names) {
      const s = new FrontEndSession({ disc: d, startDialog: name });
      run(s, 30);
      if (s.machine.queue.popupObject instanceof SlotPopup) popups++;
      for (const i of s.last) if (i.kind === 'widget') left.set(i.record.type ?? 'untyped', (left.get(i.record.type ?? 'untyped') ?? 0) + 1);
      if (s.parts.current && s.parts.current.widgets.all().length > 0) drawnWidgets++;
    }
    expect(popups).toBe(114);
    // The dialogs whose build makes a widget, the one built after 30 frames counted (a start dialog whose ONSTART switches
    // counts its target): 83 until MENU-01a; 88 since its binding lookup fix (research 138 R138.8: the three other
    // cinematics' `setfirstmission`, dlgCredits', dlgNetAbandoned's / dlgNetError's and the two movie dialogs' ONSTART
    // animations were shadowed by an earlier set's of the same name and never ran); 89 since the online card prompts
    // and the DNAS screen merged together (2026-10-03): one more start dialog's walk reaches a widget-bearing target
    // within 30 frames -- dlgMPswitch into dlgNetLogin over OPT-05i's card rows (each stream alone still counted 88);
    // 88 since ONL-06 (2026-10-04, research 153 §2): `dlgLANConnect`'s ONSTART `LobbyConnect` is the transcribed row,
    // no longer the table's placeholder 1 -- with no LAN lobby up (LAN is paused, OT.R1) and no universe of its
    // argument's name `FUN_00276780` answers 0, so that start dialog stays on its own screen (no widget) where the
    // placeholder's "connected" walked it on to `dlgLANBriefingRoom` (the LAN lane's, MENU-08: not on the path).
    expect(drawnWidgets).toBe(88);
    // MENU-16's MAPCONTROL is the one control type with no widget made; its 33 items (11 of the 12 dlg_Map* dialogs x 3)
    // were the frame's `widget` leftovers until the same fix: every map dialog's ONSTART `intel_plate_slide` -- one name
    // in all twelve sets, so eleven were refused -- now runs and hides the three before the frame, as the original does.
    expect([...left.keys()]).toEqual([]);
  }, 120_000);
});

/** An output that unlocks at once and counts what it was handed (the page's is Web Audio). */
class CountingOut implements AudioOut {
  unlocked = false;
  played = 0;
  get state(): string { return this.unlocked ? 'running' : 'locked'; }
  unlock(): void { this.unlocked = true; }
  setGain(): void {}
  play(): void { this.played++; }
  setReverb(): void {}
  rampReverb(): void {}
  loop(): null { return null; }
}

describe("the page connects PLAT-23's sound host itself (mountFrontEnd: the cues made from the source it reads)", () => {
  // jsdom draws nothing: a 2D context that takes every call, and no animation frame run.
  beforeEach(() => {
    const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const served = { kind: 'http' as const, baseUrl: '/maps' };

  it('a source without the sound files: the front end runs silent (no cues) and says which files it lacks', async () => {
    const nothing: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = mountFrontEnd('?menuflow', served, document, { assets: nothing, audio: new GameAudio(new CountingOut()) })!;
    const s = await m.session;
    expect(s).toBeInstanceOf(FrontEndSession);
    expect(s!.sounds).toBeNull();
    expect(warn.mock.calls.some((c) => c[0] === 'front end: no sound' && String(c[1]).includes('RUN/SOUNDRDR.ZAR'))).toBe(true);
    m.stop();
  });

  // PF-32 (research 233 s1.3, s6 line 1): the front end's GameAudio reads the session's four option masters at each play.
  it("PF-32: the front end's GameAudio takes the session's option values (setTunerVars: the session's uiVars, read at each play)", async () => {
    const nothing: AssetSource = { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const audio = new GameAudio(new CountingOut());
    const tuners: (() => unknown)[] = [];
    audio.setTunerVars = (vars) => { tuners.push(vars); };
    const m = mountFrontEnd('?menuflow', served, document, { assets: nothing, audio })!;
    expect(tuners).toHaveLength(1);
    expect(tuners[0]!()).toBeUndefined();                         // no session yet: the defaults
    const s = (await m.session)!;
    expect(tuners[0]!()).toBe(s.uiVars);
    m.stop();
  });

  it.skipIf(!HAVE_DISC)("over the disc: the session holds the page's cues; SwitchMenu PREVIOUS_SCREEN's BACK reaches the page's audio", async () => {
    const out = new CountingOut();
    const audio = new GameAudio(out);
    // `menuflow=dlgMenu.rdr`: the session boots the menu past the opener (BOOT-04's `--menu_state`), so a dialog is up to switch from.
    const m = mountFrontEnd('?menuflow=dlgMenu.rdr', served, document, { assets: new FsAssetSource(DISC), audio })!;
    const s = (await m.session)!;
    expect(s.sounds).toBeInstanceOf(UiSoundCues);
    document.dispatchEvent(new KeyboardEvent('keydown'));          // the gesture GameAudio waits for
    s.host.dispatch(cmd('SwitchMenu', 'PREVIOUS_SCREEN'));
    expect(out.played).toBe(1);                                    // HUDUI's .BACK (FUN_0027e720 D:L126591-126598)
    m.stop();
  }, 60_000);
});

/**
 * OT.R14 (the owner, 2026-10-03: "We need to read everything from the disk from the iso as a rule, devmode is just a
 * convenience"): `mountFrontEnd` takes the visitor's image as its source -- the worker's `{ kind: 'iso', file }`
 * request (`./worker` `SourceRequest`) -- and reads every file of the front end from it: by default through
 * `@s2u/archive`'s `IsoAssetSource` over that file, or through the `assets` the caller hands in, as for the served tree.
 */
describe('mountFrontEnd over the visitor\'s disc image (OT.R14)', () => {
  beforeEach(() => {
    const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('an ISO source with the `assets` the tests hand in: the session is made from those assets, nothing asked of the network', async () => {
    const asked: string[] = [];
    const assets: AssetSource = { list: async () => [], read: async (p) => { asked.push(p); throw new Error(`no ${p}`); } };
    const fetch = vi.spyOn(globalThis, 'fetch');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const iso = { kind: 'iso' as const, file: new File([new Uint8Array(8)], 'SOCOM II.iso') };
    const m = mountFrontEnd('?menuflow', iso, document, { assets, audio: new GameAudio(new CountingOut()) })!;
    const s = await m.session;
    expect(s).toBeInstanceOf(FrontEndSession);
    expect(asked).toEqual(expect.arrayContaining(['RUN/UI/READERC.ZAR', 'RUN/UI/READERX.ZAR', 'RUN/UIZANIM.ZAR']));
    expect(m.status).not.toMatch(/devmode/);
    expect(fetch).not.toHaveBeenCalled();
    m.stop();
  });

  const FIXTURES = resolve(fileURLToPath(import.meta.url), '../../../../test-fixtures');
  const FILES = ['RUN/UI/READERC.ZAR', 'RUN/UIZANIM.ZAR'];
  it.skipIf(!FILES.every((p) => existsSync(join(FIXTURES, p))))('an ISO source alone: read by `IsoAssetSource` over the file (a built image of the fixtures)', async () => {
    const image = buildIso(FILES.map((path) => ({ path, bytes: new Uint8Array(readFileSync(join(FIXTURES, path))) })), 'SCUS_97275');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = vi.spyOn(globalThis, 'fetch');
    const m = mountFrontEnd('?menuflow=dlgNetLogin.rdr', { kind: 'iso', file: new File([image], 'SOCOM II.iso') }, document, { audio: new GameAudio(new CountingOut()) })!;
    const s = (await m.session)!;
    expect(s).toBeInstanceOf(FrontEndSession);
    s.advance(0);
    s.advance(100);
    s.advance(200);
    expect(s.machine.shell()?.currentName).toBe('dlgNetLogin.rdr');           // READERC.ZAR's own dialog, off the image
    const notRead = warn.mock.calls.filter((c) => c[0] === 'front end: not read').flatMap((c) => c[1] as string[]);
    expect(notRead.find((x) => x.startsWith('RUN/UI/READERX.ZAR'))).toMatch(/ISO: no RUN\/UI\/READERX\.ZAR on the disc image/);   // the ISO reader's words
    expect(notRead.filter((x) => /^RUN\/UI\/READERC|^RUN\/UIZANIM/.test(x))).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    m.stop();
  }, 60_000);
});
