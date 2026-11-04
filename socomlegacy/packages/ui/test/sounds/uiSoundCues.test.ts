import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { frontEndSoundTable, soundHash, SL_PLAYSOUND_A, type UiSoundNames } from '@s2u/sound';
import { UI_COMMAND_TABLE, UiCommandHost } from '../../src/uiCommands';
import type { ZAnimSoundCommand, ZAnimUiCommand } from '../../src/zanimRuntime';
import {
  decodeUiSoundCommand, dialogSoundNames, SOUND_FLAG, STOP_ON_EXIT_FLAG_READING, STREAM_NAME_SLOT_READING, streamNameSlot, UI_SOUND_COMMAND_ROWS,
  UI_SOUND_PLACE_READING, uiSoundFadeSeconds, UiSoundCues, type UiSoundOutput, type UiSoundPlay,
} from '../../src/sounds';

/**
 * PLAT-23's cues and entries against their transcription (web research 122 §§1, 3, 4, 6): the `SOUND` command
 * (`FUN_002659c0` D:L112317-112510), SELECTION / TELETYPE / BACK / `.METAL` / the keyboard's six, and the rows
 * `StopAllSounds`, `FadeAllSounds`, `VagStreaming`, over a synthetic table and a fake output. No disc file is read here.
 */
const h = (name: string): string => String(soundHash(name));
const SCRIPT: RdrNode = [
  'SETS', [
    'HUDUI', ['.DINK', '.BACK', '.THUNK', '.SLIDE', '.NEG', '.COUNT', '.TYPE_1', '.TYPE', '.METAL', '.SKB_ENTER', '.SKB_TYPE',
      '.SFX_VOL_SLIDER', '.TCM_SLIDE', '.TCM_SELECT', '.NV_GOGGLES_ON', '.NV_GOGGLES_OFF', '.SKB_NAV'].map((n) => [h(n), 'ONESHOT', []]),
    'SMUS', [[h('MUS_MENU_THEME'), 'ST', ['N1', ['MUUI0004'], 'LOOP', [], 'MUS', []]]],
    'UIVOICE', [[h('SND_HST_01'), 'ST', ['N1', ['OPHS0001'], 'HS', []]]],
  ],
  'GROUPS', ['UI', [['SND_HS_OPDV', 'DYNAMIC_WEIGHTS', ['0.05'], 'ENTRIES', [['SND_HST_01']]]]],
];
const NAMES: UiSoundNames = { teletype: '.TYPE', back: '.BACK', selection: '.METAL' };
const KEYBOARD = ['.SLIDE', '.SLIDE\t', '.SKB_NAV', '.SKB_TYPE', '.THUNK', '.NEG'];

function output(): UiSoundOutput & { plays: UiSoundPlay[]; log: string[] } {
  const plays: UiSoundPlay[] = [], log: string[] = [];
  return {
    plays, log,
    play: (p) => { plays.push(p); log.push(`${p.kind} ${p.resolution.name}`); },
    stopAll: () => log.push('stopAll'),
    fadeAll: () => log.push('fadeAll'),
    streaming: (on) => log.push(`streaming ${on}`),
  };
}
function cues(opts?: ConstructorParameters<typeof UiSoundCues>[4]) {
  const out = output();
  const table = frontEndSoundTable(SCRIPT, new Map([['HUDUI', { names: new Map<string, number>() }]]));
  return { out, table, cues: new UiSoundCues(table, NAMES, KEYBOARD, out, opts) };
}
/** A `SOUND` command (32 bytes) as the runtime hands it: flags at +4, the volume at +8, the pan at +0xc, the pitch at +0xe. */
function sound(name: string, flags: number, fill?: (v: DataView) => void): ZAnimSoundCommand {
  const bytes = new Uint8Array(32), v = new DataView(bytes.buffer);
  v.setUint16(4, flags, true);
  fill?.(v);
  return { anim: 'A', flags, sound: name, nodeIndex: bytes[0x10]!, bytes };
}
const ui = (fn: string, arg: string): ZAnimUiCommand => ({ anim: 'A', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });
const words = (p: UiSoundPlay | undefined): unknown => (p?.kind === 'bank' ? [p.words.call, p.words.slot, p.words.sound, p.words.vol, p.words.pan, p.words.pitchMod] : p?.kind);

describe('the SOUND command\'s fields (FUN_002659c0)', () => {
  it('reads the volume under 0x10, the pan under 0x20 (else -1), the pitch under 0x40 (else 0)', () => {
    expect(decodeUiSoundCommand(sound('.DINK', 0x80))).toEqual({ flags: 0x80, volume: 1, pan: -1, pitchMod: 0, node: 0 });
    const c = sound('.DINK', 0xf0, (v) => { v.setFloat32(8, 1.2, true); v.setUint16(0xc, 90, true); v.setInt16(0xe, -12, true); v.setUint8(0x10, 3); });
    expect(decodeUiSoundCommand(c)).toEqual({ flags: 0xf0, volume: Math.fround(1.2), pan: 90, pitchMod: -12, node: 3 });
  });
});

describe('the menus\' SOUND commands (ZAnimHost.sound)', () => {
  it('a new play (0x80) of a HUDUI name is one 989snd 0x12 on its slot and index, unplaced at the command\'s volume', () => {
    const { cues: c, out } = cues();
    c.sound(sound('.TCM_SLIDE', 0x90, (v) => v.setFloat32(8, 1.2, true)));
    c.sound(sound('.METAL', 0x90, (v) => v.setFloat32(8, 0.8, true)));
    c.sound(sound('.DINK', 0x80));
    expect(out.plays.map(words)).toEqual([[SL_PLAYSOUND_A, 0, 12, 0x4cc, -1, 0], [SL_PLAYSOUND_A, 0, 8, 0x333, -1, 0], [SL_PLAYSOUND_A, 0, 0, 0x400, -1, 0]]);
    expect(out.plays.every((p) => p.source === 'zanim')).toBe(true);
  });

  it('flag 0x82 plays unplaced (UI_SOUND_PLACE_READING), and placed only when the node resolves', () => {
    expect(UI_SOUND_PLACE_READING).toBe(false);
    const a = cues();
    expect(a.cues.sound(sound('.DINK', 0x82)).kind).toBe('played');
    const b = cues({ nodePlaces: () => true });
    expect(b.cues.sound(sound('.DINK', 0x82)).kind).toBe('placed');
    expect(b.out.plays).toEqual([]);
  });

  it('without 0x80 the command only retunes; flag 0x1 looks no name up; 0x100, 0x400, 0x800 are not modelled', () => {
    const { cues: c, out } = cues();
    expect(c.sound(sound('.DINK', 0)).kind).toBe('retune');
    expect(c.sound(sound('.DINK', 0x81)).kind).toBe('no-name');
    for (const f of [SOUND_FLAG.STOP, SOUND_FLAG.PRIORITY_1, SOUND_FLAG.PRIORITY_3]) expect(c.sound(sound('.DINK', 0x80 | f)).kind).toBe('unmodelled');
    expect(out.plays).toEqual([]);
  });

  it('a silent name plays nothing (SND_DINK, " "); a stream is handed on; HS goes to the headset; a group chooses none', () => {
    const { cues: c, out } = cues();
    expect(c.sound(sound('SND_DINK', 0x82)).kind).toBe('silent');
    expect(c.sound(sound(' ', 0x280)).kind).toBe('silent');
    expect(c.sound(sound('MUS_MENU_THEME', 0x280)).kind).toBe('played');
    expect(c.sound(sound('SND_HST_01', 0x80)).kind).toBe('played');
    expect(c.sound(sound('SND_HS_OPDV', 0x280)).kind).toBe('group');
    expect(out.log).toEqual(['stream MUS_MENU_THEME', 'headset SND_HST_01']);
  });
});

describe('the code\'s cues', () => {
  it('SELECTION, TELETYPE and .METAL are forced one-shots at 1.0; BACK is +0xc; all unplaced', () => {
    const { cues: c, out } = cues();
    c.selection(); c.teletype(); c.back(); c.popup();
    expect(out.plays.map(words)).toEqual([[0x12, 0, 8, 0x400, -1, 0], [0x12, 0, 7, 0x400, -1, 0], [0x12, 0, 1, 0x400, -1, 0], [0x12, 0, 8, 0x400, -1, 0]]);
    expect(out.plays.map((p) => p.source)).toEqual(['selection', 'teletype', 'back', 'popup']);
  });

  it('the keyboard\'s six by FUN_00395de0\'s slot: ScaleDown ".SLIDE\\t" is silent while ScaleUp plays .SLIDE', () => {
    const { cues: c, out } = cues();
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => c.keyboard(i).kind)).toEqual(['played', 'silent', 'played', 'played', 'played', 'played', 'silent']);
    expect(out.plays.map((p) => (p.kind === 'bank' ? p.words.sound : -1))).toEqual([3, 16, 10, 2, 4]);
    expect(c.keyboard('KeyPressSound').kind).toBe('played');
  });

  it('a SELECTION uisounds.rdr does not give resolves "" and plays nothing', () => {
    const out = output();
    const table = frontEndSoundTable(SCRIPT, new Map([['HUDUI', { names: new Map<string, number>() }]]));
    const c = new UiSoundCues(table, { teletype: '.TYPE', back: '.BACK', selection: '' }, KEYBOARD, out);
    expect(c.selection().kind).toBe('silent');
    expect(out.plays).toEqual([]);
  });

  it('the off switch silences every cue', () => {
    const out = output();
    const table = frontEndSoundTable(SCRIPT, new Map([['HUDUI', { names: new Map<string, number>() }]]));
    table.off = true;
    const c = new UiSoundCues(table, NAMES, KEYBOARD, out);
    expect([c.selection(), c.back(), c.popup(), c.sound(sound('.DINK', 0x80))].map((o) => o.kind)).toEqual(['silent', 'silent', 'silent', 'silent']);
    c.StopAllSounds(); c.FadeAllSounds();
    expect(out.log).toEqual([]);
  });
});

describe('the sound rows of the table at 0x3dd4d0', () => {
  it('are rows 126, 127 and 134 of PLAT-08\'s table, answering 1 (true)', () => {
    for (const r of UI_SOUND_COMMAND_ROWS) {
      const row = UI_COMMAND_TABLE[r.row]!;
      expect([row.id, row.name, row.fn, row.answer]).toEqual([r.id, r.name, r.fn, true]);
    }
  });

  it('StopAllSounds stops every voice, FadeAllSounds fades the handle voices; VagStreaming ON / OFF / INPUT_STRING (strcmp)', () => {
    const { cues: c, out } = cues({ inputString: () => 'OFF' });
    const host = new UiCommandHost({ handlers: c.entries() });
    expect(host.uiCommand(ui('StopAllSounds', ''))).toBe(true);
    expect(host.uiCommand(ui('FadeAllSounds', ''))).toBe(true);
    expect(host.uiCommand(ui('VagStreaming', 'ON'))).toBe(true);
    expect(c.streamingOn).toBe(true);
    expect(host.uiCommand(ui('VagStreaming', 'INPUT_STRING'))).toBe(true);
    expect(c.streamingOn).toBe(false);
    expect(host.uiCommand(ui('VagStreaming', 'on'))).toBe(true);
    expect(out.log).toEqual(['stopAll', 'fadeAll', 'streaming true', 'streaming false']);
  });
});

describe('the dialog files\' sound names (research 122 §7\'s method)', () => {
  it('takes sigilled names, SND_ names and the values of a *Sound key, spelt as they stand', () => {
    const root: RdrNode = [['SOUNDS', ['TELETYPE', ['.TYPE']], 'CAPTION', [' '], 'ScaleDownSound', ['.SLIDE\t'], 'X', ['SND_A_DISPLAY'], 'File', ['a.rdr']]];
    expect(dialogSoundNames(root).sort()).toEqual(['.SLIDE\t', '.TYPE', 'SND_A_DISPLAY']);
  });

  it('takes the NAME of a SOUND node however it is spelt (dlgExitState.rdr\'s MUS_SUCCESS / MUS_FAILURE), and no other NAME', () => {
    const seq: RdrNode = ['SOUND', ['NAME', ['MUS_SUCCESS'], 'START', []], 'SOUND', ['NAME', ['.DINK'], 'START', []], 'CONTROL', ['NAME', ['soundslider']]];
    expect(dialogSoundNames([['SEQUENCE_DEFINITION', seq]]).sort()).toEqual(['.DINK', 'MUS_SUCCESS']);
  });
});

describe('a slot sound and its animation instance (PF-32; research 233 §3)', () => {
  const MUSIC: RdrNode = ['SETS', ['SMUS', [
    [h('MUS_SUCCESS'), 'ST', ['N1', ['MUUI0009'], 'MUS', []]], [h('MUS_FAILURE'), 'ST', ['N1', ['MUUI0010'], 'MUS', []]],
    [h('MUS_MENU_THEME'), 'ST', ['N1', ['MUUI0004'], 'LOOP', [], 'MUS', []]],
  ]]];
  /** A `SOUND` of animation `anim`; `fade` puts the seconds at +0x14 and their offset at +0x12 (D:L112356-112358). */
  const play = (anim: string, name: string, flags: number, fade?: number): ZAnimSoundCommand => {
    const bytes = new Uint8Array(32), v = new DataView(bytes.buffer);
    v.setUint16(4, flags, true);
    if (fade !== undefined) { v.setInt16(0x12, 0x14, true); v.setFloat32(0x14, fade, true); }
    return { anim, flags, sound: name, nodeIndex: 0, bytes };
  };
  function rig(): { cues: UiSoundCues; log: string[] } {
    const log: string[] = [];
    const out: UiSoundOutput = {
      play: (p) => log.push(`play ${p.resolution.name}${p.kind === 'stream' ? ` ${p.slot?.replace('\u0000', '/')}` : ''}`),
      stopAll: () => log.push('stopAll'), fadeAll: () => log.push('fadeAll'), streaming: () => {},
      stop: (slot) => log.push(`stop ${slot.replace('\u0000', '/')}`),
      fade: (slot, s) => log.push(`fade ${slot.replace('\u0000', '/')} ${s}`),
      release: (slot) => log.push(`release ${slot.replace('\u0000', '/')}`),
    };
    return { cues: new UiSoundCues(frontEndSoundTable(MUSIC, new Map()), NAMES, KEYBOARD, out), log };
  }

  it("a 0x200 slot sound stops when its animation instance stops: FadeOut(+4) when the record's +4 > 0, StopSound otherwise; a slot without the flag plays out (FUN_0026fd20 D:L118432-118480 from FUN_0026ff20 D:L118572); dlgExitState's MUS_SUCCESS stops on exit", () => {
    expect(STOP_ON_EXIT_FLAG_READING).toBe('stop or fade(+4)');
    expect(uiSoundFadeSeconds(play('A', 'MUS_FAILURE', 0x280, 1.5))).toBe(1.5);
    expect(uiSoundFadeSeconds(play('A', 'MUS_FAILURE', 0x280))).toBeNull();
    const { cues, log } = rig();
    // EXTZANIM's dlgExitState.rdr `ExitOnStart`: MUS_SUCCESS at 0x280 (research 152 §2, 122 §7); a second 0x280 with a
    // fade of 1.5 s; the menu theme at 0x80 in another animation, and in the same one without the flag.
    cues.sound(play('ExitOnStart', 'MUS_SUCCESS', 0x280));
    cues.sound(play('ExitOnStart', 'MUS_FAILURE', 0x280, 1.5));
    cues.sound(play('ExitOnStart', 'MUS_MENU_THEME', 0x80));
    cues.sound(play('CallMusic', 'MUS_MENU_THEME', 0x80));
    expect(log).toEqual(['play MUS_SUCCESS ExitOnStart/MUS_SUCCESS', 'play MUS_FAILURE ExitOnStart/MUS_FAILURE',
      'play MUS_MENU_THEME ExitOnStart/MUS_MENU_THEME', 'play MUS_MENU_THEME CallMusic/MUS_MENU_THEME']);
    log.length = 0;
    cues.stopInstance('ExitOnStart');
    // +2 set and +4 0: StopSound and free; +2 set and +4 1.5: FadeOut(1.5) then detach; +2 clear: detached, plays out
    // (the handle zeroed, D:L118470: the streamer lets the slot go and the voice plays on).
    expect(log).toEqual(['stop ExitOnStart/MUS_SUCCESS', 'fade ExitOnStart/MUS_FAILURE 1.5', 'release ExitOnStart/MUS_MENU_THEME']);
    log.length = 0;
    cues.stopInstance('ExitOnStart');                         // the handles are gone and +2 cleared (D:L118470, D:L118474)
    expect(log).toEqual([]);
    cues.stopInstance('CallMusic');                           // no flag: it plays out, its slot let go
    expect(log).toEqual(['release CallMusic/MUS_MENU_THEME']);
    log.length = 0;
    cues.stopInstance('Nothing');
    expect(log).toEqual([]);
    // The mark is the record's, set again by the next 0x200 command; a later play without it is not stopped.
    cues.sound(play('ExitOnStart', 'MUS_SUCCESS', 0x80));
    cues.stopInstance('ExitOnStart');
    expect(log).toEqual(['play MUS_SUCCESS ExitOnStart/MUS_SUCCESS', 'release ExitOnStart/MUS_SUCCESS']);
  });

  it('the name slot is keyed by the animation instance and the name (FUN_0026d940 D:L117228-117242): CallMusic and CallMusicOld are two instances', () => {
    expect(STREAM_NAME_SLOT_READING).toBe('animation and name');
    expect(streamNameSlot('CallMusic', 'MUS_MENU_THEME')).not.toBe(streamNameSlot('CallMusicOld', 'MUS_MENU_THEME'));
    const { cues, log } = rig();
    cues.sound(play('CallMusic', 'MUS_MENU_THEME', 0x280));
    cues.sound(play('CallMusicOld', 'MUS_MENU_THEME', 0x280));
    log.length = 0;
    // Each instance holds its own copy of the records (FUN_0026d940): stopping one stops its own slot only.
    cues.stopInstance('CallMusicOld');
    expect(log).toEqual(['stop CallMusicOld/MUS_MENU_THEME']);
  });
});
