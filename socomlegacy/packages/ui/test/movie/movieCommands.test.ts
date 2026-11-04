import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS, type DialogBinding } from '../../src/dialog';
import { ValveStore } from '../../src/valves';
import { ZAnimRuntime, type ZAnimRtAnimation, type ZAnimUiCommand } from '../../src/zanimRuntime';
import {
  MOVIE_COMMAND_ROWS, MovieCommands, PLAYMPEG_GATE_READING, PLAYMPEG_RECORD_INITIAL_PLACEHOLDER, decodePlayMpeg,
  deliverDialogEvent, deliverMpegEnd, runtimeEventStarter,
  type MoviePlayRequest, type MovieService,
} from '../../src/movie';

/**
 * PLAT-21's command side (web research 121 §§3-4): the entries `BackgroundMPEG` (`FUN_0027a420` D:L124410-124435),
 * `PlayMPEG` (`FUN_0027ab30` D:L124609-124674, its record parsed by `FUN_0027ad60` D:L124676-124759) and
 * `PlayMPEGNoFade` (0x27aa70-0x27ab28, its disassembly) over a fake movie service, and ONMPEGEND's delivery
 * (`FUN_00367810` D:L263357-263396). The commands are synthetic, laid out as `FUN_0027ad60` writes the 0x44-byte record.
 */

/** A fake service: every call logged. */
function service(): MovieService & { log: string[]; plays: MoviePlayRequest[] } {
  const log: string[] = [], plays: MoviePlayRequest[] = [];
  return {
    log, plays,
    background: {
      on: (file?: string) => { log.push(file === undefined ? 'on' : `on ${file}`); return true; },
      off: () => { log.push('off'); return true; },
    },
    play: (req) => { plays.push(req); log.push(`play ${req.file}`); },
  };
}

/** A `ui::UI_COMMAND` naming `fn` with the argument `arg`; `fill` writes the record's bytes past +0x10. */
function command(fn: string, arg: string, fill?: (v: DataView) => void): ZAnimUiCommand {
  const bytes = new Uint8Array(0x44), v = new DataView(bytes.buffer);
  fill?.(v);
  return { anim: 'A', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes };
}
/** `FUN_0027ad60`'s defaults: FADE, INGAME and INTERLACE 1 (D:L124700-124705), the rest 0. */
const parsed = (fill?: (v: DataView) => void) => (v: DataView): void => {
  v.setUint8(0x10, 1); v.setUint8(0x11, 1); v.setUint8(0x12, 1);
  fill?.(v);
};

describe('the movie command rows (the table at 0x3dd4d0; research 121 §3)', () => {
  it('names the three rows, their ids and functions; PlayMovie is not one', () => {
    expect(MOVIE_COMMAND_ROWS).toEqual([
      { row: 22, id: 23, name: 'PlayMPEG', fn: 0x27ab30, parse: 0x27ad60 },
      { row: 133, id: 134, name: 'PlayMPEGNoFade', fn: 0x27aa70, parse: 0 },
      { row: 135, id: 136, name: 'BackgroundMPEG', fn: 0x27a420, parse: 0 },
    ]);
    const c = new MovieCommands(service());
    expect(Object.keys(c.entries()).sort()).toEqual(['BackgroundMPEG', 'PlayMPEG', 'PlayMPEGNoFade']);
  });
});

describe('BackgroundMPEG (FUN_0027a420)', () => {
  it('ON starts the stored name, OFF stops, anything else retargets; always done', () => {
    const s = service(), c = new MovieCommands(s);
    expect(c.BackgroundMPEG(command('BackgroundMPEG', 'ON'))).toBe(true);
    expect(c.BackgroundMPEG(command('BackgroundMPEG', 'OFF'))).toBe(true);
    expect(c.BackgroundMPEG(command('BackgroundMPEG', 'run/movies/common/menuloop.pss'))).toBe(true);
    expect(s.log).toEqual(['on', 'off', 'on run/movies/common/menuloop.pss']);
  });

  it('compares with strcmp (0x198f18): "on" is a file name, not ON', () => {
    const s = service(), c = new MovieCommands(s);
    c.BackgroundMPEG(command('BackgroundMPEG', 'on'));
    expect(s.log).toEqual(['on on']);
  });

  it('INPUT_STRING takes the context\'s input string instead (D:L124418-124421)', () => {
    const s = service();
    let input: string | null = 'OFF';
    const c = new MovieCommands(s, { inputString: () => input });
    c.BackgroundMPEG(command('BackgroundMPEG', 'INPUT_STRING'));
    input = 'run/movies/b.pss';
    c.BackgroundMPEG(command('BackgroundMPEG', 'INPUT_STRING'));
    expect(s.log).toEqual(['off', 'on run/movies/b.pss']);
  });
});

describe('PlayMPEG (FUN_0027ab30) and its record (FUN_0027ad60)', () => {
  it('decodes the record: the file, FADE +0x10, INGAME +0x11, INTERLACE +0x12, AUDIOSTREAM +0x14/+0x18, INDEX +0x40', () => {
    const r = decodePlayMpeg(command('PlayMPEG', 'ArtGall2.pss', parsed((v) => { v.setUint8(0x11, 0); v.setUint32(0x14, 0, true); v.setInt32(0x18, 2, true); })));
    expect(r).toMatchObject({ file: 'ArtGall2.pss', fade: true, ingame: false, interlace: true, subtitleIndex: false, audioStream: { kind: 'number', value: 2 }, bilinear: false });
    const valve = decodePlayMpeg(command('PlayMPEG', 'x.pss', parsed((v) => { v.setUint32(0x14, 1, true); v.setUint32(0x18, 7, true); v.setUint8(0x40, 1); })));
    expect(valve.audioStream).toEqual({ kind: 'valve', nameIndex: 7 });
    expect(valve.subtitleIndex).toBe(true);
    expect(decodePlayMpeg(command('PlayMPEG', 'x.pss', parsed((v) => v.setUint32(0x14, 2, true)))).audioStream.kind).toBe('uivar');
  });

  it('is a two-call command: the first queues the movie and is not done; the next is done; then it starts over', () => {
    const s = service(), c = new MovieCommands(s);
    const cmd = command('PlayMPEG', 'Tut_01.pss', parsed());
    expect(c.PlayMPEG(cmd)).toBe(false);
    expect(s.plays.length).toBe(1);
    expect(c.PlayMPEG(cmd)).toBe(true);
    expect(s.plays.length).toBe(1);
    expect(c.PlayMPEG(command('PlayMPEG', 'Tut_02.pss', parsed()))).toBe(false);
    expect(s.log).toEqual(['play Tut_01.pss', 'play Tut_02.pss']);
  });

  it('a valve or UI-variable audio stream is read at the call, kept when the lookup fails (DAT_00408720 untouched)', () => {
    const s = service();
    const values: Record<number, number | undefined> = { 7: 3 };
    const c = new MovieCommands(s, { resolveAudioStream: (_kind, nameIndex) => values[nameIndex] });
    c.PlayMPEG(command('PlayMPEG', 'a.pss', parsed((v) => { v.setUint32(0x14, 1, true); v.setUint32(0x18, 7, true); }))); c.PlayMPEG(command('PlayMPEG', 'a.pss'));
    expect(s.plays[0]!.audioStream).toBe(3);
    c.PlayMPEG(command('PlayMPEG', 'b.pss', parsed((v) => { v.setUint32(0x14, 2, true); v.setUint32(0x18, 9, true); })));
    expect(s.plays[1]!.audioStream).toBe(3);
  });

  it('PLAYMPEG_GATE_READING: the gate is open by default; closed, the command is done at once and plays nothing', () => {
    expect(PLAYMPEG_GATE_READING).toBe('open');
    const s = service(), c = new MovieCommands(s, { gate: () => false });
    expect(c.PlayMPEG(command('PlayMPEG', 'a.pss', parsed()))).toBe(true);
    expect(c.PlayMPEGNoFade(command('PlayMPEGNoFade', 'a.pss'))).toBe(true);
    expect(s.plays).toEqual([]);
  });
});

describe('PlayMPEGNoFade (0x27aa70)', () => {
  it('its own two-call flag; fade 0, index 0; the record\'s other fields keep the last PlayMPEG\'s', () => {
    const s = service(), c = new MovieCommands(s);
    expect(c.PlayMPEGNoFade(command('PlayMPEGNoFade', 'first.pss'))).toBe(false);
    expect(s.plays[0]).toMatchObject({ file: 'first.pss', fade: false, subtitleIndex: false, ...PLAYMPEG_RECORD_INITIAL_PLACEHOLDER });
    expect(c.PlayMPEG(command('PlayMPEG', 'a.pss', parsed((v) => { v.setUint8(0x11, 0); v.setInt32(0x18, 4, true); })))).toBe(false);
    expect(c.PlayMPEGNoFade(command('PlayMPEGNoFade', 'x.pss'))).toBe(true);    // its own flag: the second call
    expect(c.PlayMPEGNoFade(command('PlayMPEGNoFade', 'b.pss'))).toBe(false);
    expect(s.plays[2]).toMatchObject({ file: 'b.pss', fade: false, subtitleIndex: false, ingame: false, interlace: true, audioStream: 4 });
  });
});

describe('ONMPEGEND\'s delivery (FUN_00367810(shell, 3, 0))', () => {
  const ev = (name: string, animation: string | null, argument: string | null = null): DialogBinding => ({ kind: 'event', name, code: DIALOG_EVENTS[name]!, state: 1, animation, argument });

  it('starts every event-3 binding of the dialog in record order, with its argument; buttons and other events are not touched', () => {
    const started: string[] = [];
    const bindings: DialogBinding[] = [
      ev('ONSTART', 'TurnOffVagStream'),
      ev('ONMPEGEND', 'switch_menu', 'dlgSecondCinematic.rdr'),
      { kind: 'button', name: 'LEFT', code: 3, state: 1, animation: 'goto_menu', argument: null },   // LEFT's code is 3 too
      ev('ONMPEGEND', 'second'),
    ];
    expect(deliverMpegEnd(bindings, (a, arg) => { started.push(`${a}(${arg ?? ''})`); return true; })).toBe(true);
    expect(started).toEqual(['switch_menu(dlgSecondCinematic.rdr)', 'second()']);
    expect(deliverDialogEvent(bindings, DIALOG_EVENTS.ONSTART!, (a) => { started.push(a); return true; })).toBe(true);
    expect(started.at(-1)).toBe('TurnOffVagStream');
  });

  it('answers false when no binding\'s animation is found; a binding with no animation starts nothing', () => {
    expect(deliverMpegEnd([ev('ONMPEGEND', null)], () => { throw new Error('called'); })).toBe(false);
    expect(deliverMpegEnd([ev('ONMPEGEND', 'missing')], () => false)).toBe(false);
    expect(deliverMpegEnd([], () => true)).toBe(false);
  });

  it('runtimeEventStarter starts the animation by name in PLAT-07\'s runtime', () => {
    const anim = (name: string): ZAnimRtAnimation => ({ name, params: { flags: 0, priority: 0, seqOffsets: [0, 0, 0, 0] }, names: ['NA'], nodeRefs: [], sequences: [] });
    const rt = new ZAnimRuntime({ sets: [{ name: 'dlgIntroCinematic', anims: [anim('switch_menu')] }], valves: new ValveStore(), nodes: { node: () => undefined }, host: { uiCommand: () => true } });
    rt.activate();
    const start = runtimeEventStarter(rt);
    expect(deliverMpegEnd([ev('ONMPEGEND', 'switch_menu', 'dlgSecondCinematic.rdr')], start)).toBe(true);
    expect(rt.running().map((i) => i.name)).toEqual(['switch_menu']);
    expect(start('nothing', null)).toBe(false);
  });
});
