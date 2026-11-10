import { describe, expect, it } from 'vitest';
import {
  MOVIE_AUDIO_GAIN_READING, MOVIE_AUDIO_START_LATENCY_READING, MOVIE_PCM_MOVE_GRANULE, MOVIE_PCM_RING_BYTES,
  MOVIE_PCM_STAGING_BYTES, MOVIE_PCM_STREAM_VOLUME, MOVIE_VIDEO_RING_BYTES, MovieAudioFeed,
  movieAudioFrameAt, movieAudioTimeline, primeMovieAudio,
} from '../src/movieAudio';
import { SSHD_HEADER_LENGTH } from '../src/pss';

/**
 * PLAT-20's transcription (web research 137 §3-§4): the movie's audio path of the original -- the audio callback into
 * the 48 KB staging ring (`FUN_0030aca0`), the per-picture move into the 989snd PCM ring 1 KB at a time
 * (`FUN_0030a3b0`, `FUN_0030a2d0`), the start once the 24 KB ring is full (`FUN_0030b1d0` D:L208747-208751), the
 * priming of the create (`FUN_0030b4d0`) -- and the sync rule the page holds from it, on synthetic packets and
 * synthetic timestamps. CI: no disc.
 */

describe('the constants, as read (research 137 §3)', () => {
  it('holds the buffer sizes FUN_00309b40 sets and the open\'s volume', () => {
    expect(MOVIE_PCM_STAGING_BYTES).toBe(0xc000);     // DAT_00451cdc, D:L207972
    expect(MOVIE_PCM_RING_BYTES).toBe(0x6000);        // DAT_00451ce4, D:L207974
    expect(MOVIE_VIDEO_RING_BYTES).toBe(0x30000);     // DAT_00451cd4, D:L207962
    expect(MOVIE_PCM_MOVE_GRANULE).toBe(0x400);       // FUN_0030a3b0 0x30a498-0x30a4f8, FUN_0030a2d0
    expect(MOVIE_PCM_STREAM_VOLUME).toBe(0x366);      // FUN_0030a7c0, D:L208361
    expect(MOVIE_AUDIO_GAIN_READING).toBe(23258 / (2 * 32766));
    expect(MOVIE_AUDIO_START_LATENCY_READING).toBe(0);
  });
});

describe('MovieAudioFeed.offer: the audio callback FUN_0030aca0', () => {
  it('counts the track\'s first 0x28 bytes as header, across packets, and the rest into the staging ring', () => {
    const f = new MovieAudioFeed();
    expect(f.offer(30)).toBe('copied');
    expect(f.state).toBe(0);
    expect(f.fill).toBe(0);
    expect(f.offer(4073)).toBe('copied');
    expect(f.state).toBe(1);
    expect(f.fill).toBe(4073 - (SSHD_HEADER_LENGTH - 30));
  });

  it('copies a packet only whole: one that does not fit the staging ring\'s free space is refused', () => {
    const f = new MovieAudioFeed();
    f.offer(SSHD_HEADER_LENGTH);
    let copied = 0;
    while (f.offer(4073) === 'copied') copied += 4073;
    expect(copied).toBe(12 * 4073);                        // 49,152 / 4073 = 12.07
    expect(f.fill).toBe(copied);
    expect(MOVIE_PCM_STAGING_BYTES - f.fill).toBeLessThan(4073);
  });

  it('in the header state takes up to the header\'s rest plus the whole staging ring', () => {
    const f = new MovieAudioFeed();
    expect(f.offer(SSHD_HEADER_LENGTH + MOVIE_PCM_STAGING_BYTES + 1)).toBe('refused');
    expect(f.offer(SSHD_HEADER_LENGTH + MOVIE_PCM_STAGING_BYTES)).toBe('copied');
    expect(f.fill).toBe(MOVIE_PCM_STAGING_BYTES);
  });

  it('once a packet\'s fourth substream byte is non-zero, later packets with a zero one are taken and not copied (D:L208527-208531)', () => {
    const f = new MovieAudioFeed();
    f.offer(SSHD_HEADER_LENGTH);
    expect(f.offer(100, 0)).toBe('copied');
    expect(f.offer(100, 1)).toBe('copied');
    expect(f.offer(100, 0)).toBe('taken');
    expect(f.fill).toBe(200);
    f.reset();
    expect(f.offer(SSHD_HEADER_LENGTH, 0)).toBe('copied');      // the close clears the flag (FUN_0030b120, D:L208653)
  });
});

describe('MovieAudioFeed.presented: the per-picture move and the start (FUN_0030a3b0, FUN_0030b1d0)', () => {
  const primed = (bytes: number): MovieAudioFeed => {
    const f = new MovieAudioFeed();
    f.offer(SSHD_HEADER_LENGTH);
    for (let left = bytes; left > 0; left -= 4073) f.offer(Math.min(4073, left));
    return f;
  };

  it('fills the 24 KB ring before the start and starts on the picture that completes it', () => {
    const f = primed(45_000);
    const r = f.presented(0);
    expect(r.moved).toBe(MOVIE_PCM_RING_BYTES);
    expect(r.started).toBe(true);
    expect(f.state).toBe(2);
    expect(f.fill).toBe(45_000 - MOVIE_PCM_RING_BYTES);
  });

  it('moves whole kilobytes only, and nothing while the staging ring holds less than one', () => {
    const f = primed(10_000);
    expect(f.presented(0)).toEqual({ moved: 9 * 1024, started: false });
    expect(f.fill).toBe(10_000 - 9 * 1024);
    expect(f.presented(0)).toEqual({ moved: 0, started: false });
    f.offer(4073);
    // 784 + 4073 = 4857 staged: 4 KB moves, the ring holds 13 KB of its 24.
    expect(f.presented(0)).toEqual({ moved: 4 * 1024, started: false });
    for (let i = 0; i < 3; i++) f.offer(4073);
    expect(f.presented(0)).toEqual({ moved: 11 * 1024, started: true });
  });

  it('once playing refills the free kilobytes behind the play position, keeping 1 KB clear of it', () => {
    const f = primed(MOVIE_PCM_STAGING_BYTES - 4000);
    f.presented(0);
    // 6406.4 bytes a picture at 29.97 (192,000 B/s x 1001/30000): after one picture the ring has 6 KB free, less the 1 KB.
    expect(f.presented(6406).moved).toBe(5 * 1024);
    expect(f.ringWrite).toBe(5 * 1024);
    // The position within 1 KB ahead of the write pointer: nothing moves.
    expect(f.presented(MOVIE_PCM_RING_BYTES + 5 * 1024 + 100).moved).toBe(0);
  });

  it('right after the start (the play position on the write position) the ring has no room (FUN_0030a2d0 D:L208146)', () => {
    const f = primed(MOVIE_PCM_STAGING_BYTES - 4000);
    expect(f.presented(0)).toEqual({ moved: MOVIE_PCM_RING_BYTES, started: true });
    expect(f.ringWrite).toBe(0);
    // Position 0, write 0: the distance is 0, inside the guard -- not the 0x5c00 the formula alone would give.
    expect(f.presented(0).moved).toBe(0);
    expect(f.presented(0x3ff).moved).toBe(0);
    expect(f.presented(0x400).moved).toBe(0);
    expect(f.presented(0x800).moved).toBe(0x400);
  });

  it('keeps up with a picture every 1001/30000 s for a whole track, with no underrun (the healthy console)', () => {
    const f = new MovieAudioFeed();
    f.offer(SSHD_HEADER_LENGTH);
    const rate = 192_000, period = 1001 / 30000;
    let arrived = 0, underruns = 0, startTick = -1;
    for (let tick = 0; tick < 3000; tick++) {
      // The stream delivers its audio a little ahead of the pictures (the priming's lead), packet by packet.
      while (arrived < (tick + 8) * period * rate && f.offer(4073) === 'copied') arrived += 4073;
      const played = startTick < 0 ? 0 : Math.floor((tick - startTick) * period * rate);
      if (startTick >= 0 && f.underrun(played)) underruns++;
      if (f.presented(played).started) startTick = tick;
    }
    expect(startTick).toBe(0);
    expect(underruns).toBe(0);
  });

  it('runs dry when the pictures stall longer than the ring holds (a 20-tick stall: 0.67 s against 128 ms)', () => {
    const f = primed(MOVIE_PCM_STAGING_BYTES - 4000);
    f.presented(0);
    const per = 6406;
    for (let t = 1; t <= 3; t++) f.presented(t * per);
    expect(f.underrun(3 * per)).toBe(false);
    expect(f.underrun(23 * per)).toBe(true);
  });

  it('reset (FUN_0030a6e0) stops the stream and forgets the track: a restart starts over from the header', () => {
    const f = primed(30_000);
    f.presented(0);
    f.reset();
    expect([f.state, f.fill, f.moved, f.ringWrite, f.started]).toEqual([0, 0, 0, 0, false]);
  });
});

describe('primeMovieAudio: the create\'s priming loop (FUN_0030b4d0, D:L208802-208814)', () => {
  const v = (n: number) => ({ streamId: 0xe0, length: n });
  const a = (n: number) => ({ streamId: 0xbd, length: n, subStream: Uint8Array.of(0xff, 0xa0, 0, 0) });

  it('demuxes until the first packet a callback refuses: here the staging ring', () => {
    const packets = [a(SSHD_HEADER_LENGTH), ...Array.from({ length: 30 }, (_, i) => (i % 2 ? v(2000) : a(4073)))];
    const p = primeMovieAudio(packets);
    expect(p.stoppedBy).toBe('audio');
    expect(p.staged).toBe(12 * 4073);
    expect(p.startsOnFirstPicture).toBe(true);
  });

  it('or the video ring (0x30000 less the 0x10 the write pointer starts at)', () => {
    const p = primeMovieAudio([a(SSHD_HEADER_LENGTH), a(4073), v(0x30000 - 0x10 - 100), v(100), v(1), a(4073)]);
    expect(p.stoppedBy).toBe('video');
    expect(p.videoBytes).toBe(0x30000 - 0x10);
    expect(p.staged).toBe(4073);
    expect(p.startsOnFirstPicture).toBe(false);
  });

  it('or the stream\'s end', () => {
    expect(primeMovieAudio([a(SSHD_HEADER_LENGTH), a(100)]).stoppedBy).toBe('end');
  });
});

describe('the sync rule (research 137 §4): the sound\'s frame against the time since picture 0', () => {
  const tl = movieAudioTimeline(10 * 1024 * 1024 + 700, { sampleRate: 48000, channels: 2 });

  it('plays the track\'s whole kilobytes, 4 bytes a frame, and loops the ring\'s last 24 KB after them', () => {
    expect(tl.frames).toBe(10 * 1024 * 1024 / 4);
    expect(tl.loopFrames).toBe(MOVIE_PCM_RING_BYTES / 4);
    expect(tl.rate).toBe(48000);
  });

  it('is free of the pictures: sample 0 with picture 0, then 48000 a second, whatever the ticks did', () => {
    expect(movieAudioFrameAt(tl, -0.001)).toBe(-1);
    expect(movieAudioFrameAt(tl, 0)).toBe(0);
    // Ticks of 1001/30000 s: picture n is presented at n x 1001/30000, its sound at n x 1601.6 frames.
    for (const n of [1, 30, 299, 1500]) expect(movieAudioFrameAt(tl, (n * 1001) / 30000)).toBe(Math.floor((n * 1001 * 48000) / 30000));
    // A late tick (the picture shown a tick later) moves the picture, not the sound.
    expect(movieAudioFrameAt(tl, 2)).toBe(96000);
  });

  it('after the last moved byte replays the ring: the last 6144 frames, round and round', () => {
    const end = tl.frames / 48000;
    expect(movieAudioFrameAt(tl, end)).toBe(tl.frames - tl.loopFrames);
    expect(movieAudioFrameAt(tl, end + 100 / 48000)).toBe(tl.frames - tl.loopFrames + 100);
    expect(movieAudioFrameAt(tl, end + (tl.loopFrames + 5) / 48000)).toBe(tl.frames - tl.loopFrames + 5);
  });

  it('a track shorter than the ring never starts (it never fills it): no frame plays', () => {
    const short = movieAudioTimeline(0x5c00, { sampleRate: 48000, channels: 2 });
    expect(short.frames).toBe(0);
    expect(movieAudioFrameAt(short, 1)).toBe(-1);
  });
});
