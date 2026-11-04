import { describe, expect, it } from 'vitest';
import {
  BlackPictureSource, MOVIE_PICTURE_COUNTS, MOVIE_PICTURE_PERIOD_READING, MovieFrameClock, PAD_STATE, type BlackPicture,
} from '@s2u/fmv';
import { MovieCommands, deliverMpegEnd, type DialogBinding, type ZAnimUiCommand } from '@s2u/ui';
import { MOVIE_INDEX_FALLBACK_NAME, MoviePlayerHost } from '../src/moviePlayerHost';

/**
 * PLAT-21's page side: the host that joins `@s2u/fmv`'s two players to `@s2u/ui`'s movie commands, over the black
 * picture source that stands in for PLAT-19b's decoder. The counts are research 121 §11's.
 */

const UP = { cross: PAD_STATE.UP };

function rig(exists?: (name: string) => boolean) {
  const layer: BlackPicture[] = [], ends: number[] = [], pops: number[] = [], alpha: number[] = [];
  let frame = 0;
  const host = new MoviePlayerHost<BlackPicture>({
    source: new BlackPictureSource(MOVIE_PICTURE_COUNTS, exists),
    layer: { present: (p) => layer.push(p) },
    setAlpha: (a) => alpha.push(a),
    onMpegEnd: () => ends.push(frame),
    onStatePop: () => pops.push(frame),
  });
  const run = (n: number): string[] => { const out: string[] = []; for (let i = 0; i < n; i++) { frame++; out.push(host.frame(MOVIE_PICTURE_PERIOD_READING, UP)); } return out; };
  return { host, layer, ends, pops, alpha, run, frame: () => frame };
}

describe('the movie host (research 121 §§2, 6, 10)', () => {
  it('the boot\'s SONY448: 310 pictures on frames 1..310, event 3 once on frame 312, then closed', () => {
    const r = rig();
    r.host.background.build({ type: 1, filename: 'run/movies/common/sony448.pss' });
    expect(r.run(400).every((s) => s === 'menu')).toBe(true);
    expect(r.layer.length).toBe(310);
    expect(r.layer.at(-1)).toEqual({ index: 309, black: true });
    expect(r.ends).toEqual([312]);
    expect(r.host.background.state).toBe('STOPPED');
  });

  it('ONMPEGEND reaches the current dialog\'s bindings through deliverMpegEnd', () => {
    const started: string[] = [];
    const bindings: DialogBinding[] = [{ kind: 'event', name: 'ONMPEGEND', code: 3, state: 1, animation: 'switch_menu', argument: 'dlgSecondCinematic.rdr' }];
    const host = new MoviePlayerHost<BlackPicture>({
      source: new BlackPictureSource(), layer: { present: () => {} },
      onMpegEnd: () => { deliverMpegEnd(bindings, (a, arg) => { started.push(`${a} ${arg}`); return true; }); },
    });
    host.background.build({ type: 1, filename: 'run/movies/common/sony448.pss' });
    for (let i = 0; i < 400; i++) host.frame(MOVIE_PICTURE_PERIOD_READING, UP);
    expect(started).toEqual(['switch_menu dlgSecondCinematic.rdr']);
  });

  it('PlayMPEG through the commands: queued, the menu suspended while the movie state runs, popped at its end, the background restarted, the command done', () => {
    const r = rig();
    r.host.background.build({ type: 1, filename: 'run/movies/common/menuloop.pss' });
    r.run(10);
    const commands = new MovieCommands(r.host);
    const bytes = new Uint8Array(0x44);
    bytes[0x10] = 1;                                              // FADE
    const cmd: ZAnimUiCommand = { anim: 'PlayMovie', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn: 'PlayMPEG', arg: 'run/movies/intro_2.pss', loc: 0, bytes };
    expect(commands.PlayMPEG(cmd)).toBe(false);
    const states = r.run(1 + 3836 + 2 + 1);
    expect(states.every((s) => s === 'movie')).toBe(true);        // the push's frame, 3836 pictures, NODATA, the pop's tick, the pop's frame
    expect(r.pops).toEqual([10 + 3840]);
    expect(r.alpha).toEqual([1]);                                 // the exit's alpha; no skip, no fade
    expect(r.run(1)).toEqual(['menu']);
    expect(r.layer.at(-1)).toEqual({ index: 0, black: true });    // MENULOOP from picture 0 (FUN_001f45e0, row 16)
    expect(commands.PlayMPEG(cmd)).toBe(true);
    expect(r.ends).toEqual([]);                                   // the movie state fires no ONMPEGEND
  });

  it('the push covers the state under it first: onCover once, before the movie state\'s init (FUN_002ce9e0 D:L171928-171931)', () => {
    const log: string[] = [];
    const host = new MoviePlayerHost<BlackPicture>({
      source: new BlackPictureSource(), layer: { present: () => {} }, onMpegEnd: () => {},
      onCover: () => log.push(`cover ${host.movieState.active ? 'after' : 'before'} init`),
    });
    host.play({ file: 'run/movies/intro_2.pss', fade: false, ingame: false, interlace: false, subtitleIndex: false, audioStream: 0, destRect: false, bilinear: false, rectWords: [] });
    expect(log).toEqual([]);                                      // queued: nothing until the next frame applies it
    host.frame(MOVIE_PICTURE_PERIOD_READING, UP);
    host.frame(MOVIE_PICTURE_PERIOD_READING, UP);
    expect(log).toEqual(['cover before init']);
  });

  it('a pushed movie skipped by CROSS released, with FADE: 33 ticks at 29.97/s from the release to the pop request, applied the next frame', () => {
    const r = rig();
    r.host.play({ file: 'run/movies/intro_2.pss', fade: true, ingame: false, interlace: false, subtitleIndex: false, audioStream: 0, destRect: false, bilinear: false, rectWords: [] });
    r.host.frame(MOVIE_PICTURE_PERIOD_READING, UP);                // the push applied: the movie state not ticked
    r.host.frame(MOVIE_PICTURE_PERIOD_READING, { cross: PAD_STATE.PRESSED });
    let n = 0;
    for (let pad = PAD_STATE.RELEASED as number; r.pops.length === 0; pad = PAD_STATE.UP) { n++; r.host.frame(MOVIE_PICTURE_PERIOD_READING, { cross: pad as 0 | 3 }); }
    expect(n).toBe(33 + 1);                                       // 33 ticks to the pop's request, then the frame that applies it
  });

  it('CG applies the push and the pop each on a frame that ticks nothing (R115.11; FUN_002ce9e0 D:L171884-171887, D:L171918-171931)', () => {
    const r = rig();
    r.host.background.build({ type: 1, filename: 'run/movies/common/menuloop.pss' });
    r.run(3);
    expect(r.layer).toHaveLength(3);
    r.host.play({ file: 'run/movies/common/sony448.pss', fade: false, ingame: false, interlace: false, subtitleIndex: false, audioStream: 0, destRect: false, bilinear: false, rectWords: [] });
    expect(r.run(1)).toEqual(['movie']);                          // frame 4: the push applied; neither player ticked
    expect(r.layer).toHaveLength(3);
    expect(r.host.movieState.active).toBe(true);
    r.run(1);                                                     // frame 5: the movie state's first tick, its first picture
    expect(r.layer.at(-1)).toEqual({ index: 0, black: true });
    r.run(309 + 1);                                               // frames 6..314 pictures 1..309, 315 NODATA
    expect(r.layer.at(-1)).toEqual({ index: 309, black: true });
    expect(r.run(1)).toEqual(['movie']);                          // frame 316: the tick that closes and asks for the pop
    expect(r.pops).toEqual([]);
    expect(r.host.moviePlaying).toBe(true);
    const shown = r.layer.length;
    expect(r.run(1)).toEqual(['movie']);                          // frame 317: the pop applied (exit, OnPop); nothing ticked
    expect(r.pops).toEqual([317]);
    expect(r.layer).toHaveLength(shown);
    expect(r.host.moviePlaying).toBe(false);
    expect(r.run(1)).toEqual(['menu']);                           // frame 318: the menu state ticks again, MENULOOP from 0
    expect(r.layer.at(-1)).toEqual({ index: 0, black: true });
  });

  it('PlayMPEG INDEX: the key resolved through mpeg_subtitles.rdr (resolveSubtitleKey) is the file opened; a key with no FILENAME, or no lookup, opens INVALID, which fails: the state closes on its first tick and pops the frame after (FUN_001eda60, 0x1ede18-0x1ede24)', () => {
    const req = { file: 'Intro', fade: true, ingame: false, interlace: false, subtitleIndex: true, audioStream: 0, destRect: false, bilinear: false, rectWords: [] };
    const asked: string[] = [];
    const pops: number[] = [];
    let frame = 0;
    const mk = (resolveSubtitleKey?: (key: string) => string | null) => new MoviePlayerHost<BlackPicture>({
      source: new BlackPictureSource(MOVIE_PICTURE_COUNTS, (n) => { asked.push(n); return n !== MOVIE_INDEX_FALLBACK_NAME; }),
      layer: { present: () => {} }, onMpegEnd: () => {}, onStatePop: () => pops.push(frame), resolveSubtitleKey,
    });
    const h = mk((key) => (key === 'Intro' ? 'run/movies/intro_2.pss' : null));
    h.play(req);
    frame = 1; expect(h.frame(MOVIE_PICTURE_PERIOD_READING, UP)).toBe('movie');
    expect(asked).toEqual(['run/movies/intro_2.pss']);
    expect(pops).toEqual([]);
    for (const host of [mk(), h]) {                               // no mpeg_subtitles.rdr loaded; a key it does not hold
      asked.length = 0; pops.length = 0;
      host.play({ ...req, file: 'NoSuchKey' });
      for (frame = 1; frame <= 3; frame++) host.frame(MOVIE_PICTURE_PERIOD_READING, UP);
      expect(asked).toEqual(['INVALID']);
      expect(pops).toEqual([3]);                                  // pushed on 1, closed on the first tick (2, 0x1ed138), popped on 3
    }
    expect(MOVIE_INDEX_FALLBACK_NAME).toBe('INVALID');            // the string at 0x3e2140, read off the ELF
  });

  it('frames(elapsed) runs the menu frames the clock stand-in says are due', () => {
    const r = rig();
    r.host.background.build({ type: 1, filename: 'run/movies/common/sony448.pss' });
    const clock = new MovieFrameClock();
    let ran = 0;
    for (let i = 0; i < 60; i++) ran += r.host.frames(clock, 1 / 60, UP);
    expect(ran).toBe(29);                                         // one second of 60 Hz display: 29 frames due at 29.97/s
    expect(r.layer.length).toBe(29);
  });
});
