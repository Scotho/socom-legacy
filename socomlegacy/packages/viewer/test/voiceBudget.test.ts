import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GRAIN } from '@s2u/sound';
import {
  busiestTones, instanceCheck, LOOP_VOICE_HOLD_ADAPTATION, LOOP_VOICE_STEAL_PLACEHOLDER, soundPriority, STREAM_VOICE_PRIORITY_READING, streamAsks, tonePriority, VOICE_COUNT_READING, VOICE_PLAY_ADAPTATION, VOICE_STOP_RAMP_ADAPTATION,
  VOICE_UNSTEALABLE_READING, VoiceBudget, voiceRange,
} from '../src/voiceBudget';

/**
 * LATER 1218 (simulation track; reading, pending review): the sound driver's voice budget. 989snd (`989SND.IRX`) keys a
 * tone on a voice of its sound's group range (`FUN_000178b8` D:L14077-14157, from `FUN_0000465c` D:L3249-3253): the
 * lowest free voice; none free, the lowest priority -- then the oldest -- is stolen when its priority is at most the
 * newcomer's and under 0x7e, else the tone is refused. Before this the page played every sound it was asked for at
 * once, with no limit (`audio.ts` `transient`).
 */

/** A stand-in play: its stops counted. */
const holder = () => { const h = { stops: 0, stop: () => { h.stops++; } }; return h; };

describe('LATER 1218: the voice budget (989snd FUN_000178b8)', () => {
  it('48 voices; groups 1, 2, 4, 6 and 14 on voices 24-47, every other group 0-47; a group past 15 is 15 (FUN_00017170 IRX D:L13800-13836; FUN_00345230 EE D:L243341-243345; D:L14090-14092)', () => {
    expect(VOICE_COUNT_READING).toBe(48);
    for (const g of [1, 2, 4, 6, 14]) expect(voiceRange(g)).toEqual([24, 47]);
    for (const g of [0, 3, 5, 7, 13, 15]) expect(voiceRange(g)).toEqual([0, 47]);
    expect(voiceRange(40)).toEqual(voiceRange(15));
  });

  it('PROVEN for all 16 groups: the ranges as the original holds them running -- a memory read of the loaded 989SND.IRX (PC 1, 2026-11-18, l1218-iop)', () => {
    // The loaded module's group table at IOP 0xb60cc (the module at 0x99330; DAT_0001cd9c), from a savestate's IOP RAM
    // (agent-mail/evidence/later1218-capture/l1218-iop/, sha256 6712840560...): s16 (min, max) pairs, groups 0-15 (8-15
    // read by the review of 8e1a946d91 from the same snapshot, its F7).
    const read: [number, number][] = [[0, 47], [24, 47], [24, 47], [0, 47], [24, 47], [0, 47], [24, 47], [0, 47],
      [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [24, 47], [0, 47]];
    expect(read.map((_, g) => voiceRange(g))).toEqual(read);
  });

  it('a free voice is the lowest of the range: a group-1 play never takes voices 0-23, a group-0 play fills them first (D:L14097-14117)', () => {
    const b = new VoiceBudget();
    expect(b.take(1, 10, 1, 0, 1, holder())).toEqual([24]);
    expect(b.take(0, 10, 2, 0, 1, holder())).toEqual([0, 1]);
    expect(b.busy(0)).toBe(3);
    expect(b.busy(1)).toBe(0);                                      // each voice free again once its sound has ended
  });

  it('full: the lowest priority is stolen, the oldest of equals; the victim\'s play is stopped (D:L14118-14139)', () => {
    const b = new VoiceBudget();
    const plays = Array.from({ length: 24 }, () => holder());
    plays.forEach((h, i) => b.take(1, i === 5 ? 3 : i === 9 ? 3 : 50, 1, 0, 10, h));   // voices 24-47 full; 29 and 33 at 3
    const newer = holder();
    expect(b.take(1, 40, 1, 1, 10, newer)).toEqual([29]);           // 29 and 33 tie at 3: 29 keyed on first
    expect(plays[5]!.stops).toBe(1);
    expect(plays[9]!.stops).toBe(0);
    expect(b.take(1, 40, 1, 1, 10, holder())).toEqual([33]);
    expect(plays[9]!.stops).toBe(1);
  });

  it('greater-or-equal steals; a lower newcomer is refused, and so is any against 0x7e or above (D:L14134-14156)', () => {
    const fill = (p: number): { b: VoiceBudget; plays: ReturnType<typeof holder>[] } => {
      const b = new VoiceBudget();
      const plays = Array.from({ length: 24 }, () => holder());
      for (const h of plays) b.take(2, p, 1, 0, 10, h);
      return { b, plays };
    };
    let f = fill(20);
    expect(f.b.take(2, 20, 1, 1, 10, holder())).toEqual([24]);      // equal: the oldest goes
    f = fill(20);
    expect(f.b.take(2, 19, 1, 1, 10, holder())).toEqual([]);        // lower: refused, nothing stopped
    expect(f.plays.every((h) => h.stops === 0)).toBe(true);
    expect(VOICE_UNSTEALABLE_READING).toBe(0x7e);
    f = fill(0x7e);
    expect(f.b.take(2, 0x7f, 1, 1, 10, holder())).toEqual([]);
    // The stored priority is a byte, the newcomer's a signed one: a negative tone priority is never stolen (as 128-255)
    // and steals nothing.
    f = fill(-1);
    expect(f.b.take(2, 0x7d, 1, 1, 10, holder())).toEqual([]);
    f = fill(10);
    expect(f.b.take(2, -1, 1, 1, 10, holder())).toEqual([]);
  });

  it('VOICE_PLAY_ADAPTATION: each voice at its own priority and end; a steal frees one voice, and the play stops only when it holds none', () => {
    expect(VOICE_PLAY_ADAPTATION).toBe('per voice, one buffer');
    // An M4A1's shot on MP2: tones at 55, 99, 0, 0 (the diagnostic of 2026-11-18). Held in group 1 (24-47) beside 20 others at 60.
    const b = new VoiceBudget();
    const gun = holder();
    expect(b.takeVoices([55, 99, 0, 0].map((priority) => ({ group: 1, priority, until: 10 })), 0, gun)).toEqual([24, 25, 26, 27]);
    for (let i = 0; i < 20; i++) b.take(1, 60, 1, 0, 10, holder());
    // A step at 44: the lowest voice is a priority-0 tone of the shot -- stolen, and the shot plays on (it holds two more).
    expect(b.take(1, 44, 1, 1, 10, holder())).toEqual([26]);
    expect(gun.stops).toBe(0);
    expect(b.take(1, 44, 1, 1, 10, holder())).toEqual([27]);
    expect(gun.stops).toBe(0);
    // The next lowest are the two steps (44; the older first): the shot's 55 and 99 stand.
    expect(b.take(1, 50, 1, 1, 10, holder())).toEqual([26]);
    expect(b.take(1, 50, 1, 1, 10, holder())).toEqual([27]);
    expect(b.take(1, 55, 1, 1, 10, holder())).toEqual([26]);             // 50, the older of the two
    expect(b.take(1, 55, 1, 1, 10, holder())).toEqual([27]);
    expect(b.take(1, 55, 1, 1, 10, holder())).toEqual([24]);             // the shot's 55 (the oldest 55) goes; it holds the 99
    expect(gun.stops).toBe(0);
    // Everything else at 99 or below goes first by priority, then age; the shot's 99 is the oldest 99, so it goes first of those.
    let taken: number[] = [];
    for (let k = 0; k < 30 && gun.stops === 0; k++) taken = b.take(1, 99, 1, 1, 10, holder());
    expect(taken).toEqual([25]);                                          // its last voice: the shot is stopped
    expect(gun.stops).toBe(1);
  });

  it("a voice is free again at its own end, not the play's: a short crack frees before its tail", () => {
    const b = new VoiceBudget();
    const shot = holder();
    for (let i = 0; i < 22; i++) b.take(1, 90, 1, 0, 10, holder());
    expect(b.takeVoices([{ group: 1, priority: 99, until: 0.2 }, { group: 1, priority: 99, until: 1.1 }], 0, shot)).toEqual([46, 47]);
    expect(b.busy(0.1)).toBe(24);
    expect(b.busy(0.3)).toBe(23);
    expect(b.take(1, 10, 1, 0.3, 1, holder())).toEqual([46]);            // the crack's voice, free since 0.2
    // A play granted none of its voices does not sound; one granted any does.
    const c = new VoiceBudget();
    for (let i = 0; i < 24; i++) c.take(1, 90, 1, 0, 10, holder());
    expect(c.takeVoices([{ group: 1, priority: 50, until: 1 }, { group: 0, priority: 50, until: 1 }], 0, holder())).toEqual([-1, 0]);
  });

  it('release: a stopped play\'s voices are free at once (a restart\'s stop, TELETYPE_TICK_SOUND_READING)', () => {
    const b = new VoiceBudget();
    const h = holder();
    b.take(0, 10, 3, 0, 10, h);
    b.release(h);
    expect(b.busy(0)).toBe(0);
    expect(h.stops).toBe(0);                                        // the caller stops its own play
  });

  it('a tone\'s priority scaled by the play\'s volume with flags bits 1-2 (FUN_000069a4 IRX D:L4283-4313)', () => {
    expect(tonePriority({ priority: 50, flags: 0 }, 0)).toBe(50);   // bits 1-2 clear: the tone's own
    // mode 1 (flags 2): the cut a fifth, the whole cut at volume 0, none above 950 (0x3b6)
    expect(tonePriority({ priority: 50, flags: 2 }, 0)).toBe(40);
    expect(tonePriority({ priority: 50, flags: 2 }, 475)).toBe(45);
    expect(tonePriority({ priority: 50, flags: 2 }, 951)).toBe(50);
    expect(tonePriority({ priority: 50, flags: 2 }, 950)).toBe(50);
    // mode 2 (flags 4): half; mode 3 (flags 6): the whole priority
    expect(tonePriority({ priority: 51, flags: 4 }, 0)).toBe(26);
    expect(tonePriority({ priority: 50, flags: 6 }, 0)).toBe(0);
    expect(tonePriority({ priority: -51, flags: 4 }, 0)).toBe(-26);  // C's division: toward zero
    expect(tonePriority({ priority: 4, flags: 2 }, 0)).toBe(4);      // a cut of 0 changes nothing
  });

  it("a sound's priority is its highest tone's, its STARTCHILDSOUND children's tones included (the review's F1); none, 0", () => {
    const grainData = new Uint8Array(40);
    const v = new DataView(grainData.buffer);
    grainData[0] = 40; v.setUint16(14, 0, true);                    // a tone at 0: priority 40, no scaling
    v.setInt32(24 + 12, 1, true);                                     // a child block at 24: sound 1
    const bank = { grainData, sounds: [
      { vol: 0, volGroup: 0, pan: 0, instanceLimit: 0, flags: 0, grains: [{ type: GRAIN.STARTCHILDSOUND, arg: 24, delay: 0 }] },
      { vol: 0, volGroup: 0, pan: 0, instanceLimit: 0, flags: 0, grains: [{ type: GRAIN.TONE, arg: 0, delay: 0 }] },
      { vol: 0, volGroup: 0, pan: 0, instanceLimit: 0, flags: 0, grains: [] },
    ] };
    expect(soundPriority(bank, 1, 0x400)).toBe(40);
    expect(soundPriority(bank, 0, 0x400)).toBe(40);
    expect(soundPriority(bank, 2, 0x400)).toBe(0);
  });

  /**
   * LATER 1220 (a): the per-sound instance limit (989snd `FUN_0000d3b0` -> `FUN_0000d274`, IRX D:L8234-8296): a sound
   * whose flags carry 0x8 counts its live instances; at its `InstanceLimit` (+5) a new play is refused unless 0x10 (the
   * quietest stolen, when the new one is louder) or 0x20 (the oldest stolen) lets it in; a limit of 0 refuses it. The
   * disc's 24 such sounds are all 0x10: `.MOVING_THRU_FO` (limit 1), the hums, `~FAN_ROTATE`, `~FIRE_SM` (2-3).
   */
  it('LATER 1220: the instance limit (FUN_0000d274): under it, play; at it, 0x10 steals the quietest if the new one is louder, 0x20 the oldest, neither refuses; limit 0 refuses; no flag 0x8, no limit', () => {
    const foliage = { flags: 0x18, instanceLimit: 1 };                       // .MOVING_THRU_FO
    expect(instanceCheck(foliage, [], 500)).toEqual({ play: true, steal: null });
    expect(instanceCheck(foliage, [{ volume: 500, start: 1 }], 600)).toEqual({ play: true, steal: 0 });
    expect(instanceCheck(foliage, [{ volume: 500, start: 1 }], 500)).toEqual({ play: false, steal: null });   // not louder
    const hum = { flags: 0x19, instanceLimit: 3 };                           // ~ELEC_HUM
    const three = [{ volume: 300, start: 1 }, { volume: 200, start: 2 }, { volume: 400, start: 3 }];
    expect(instanceCheck(hum, three, 250)).toEqual({ play: true, steal: 1 });                // the quietest, 200
    expect(instanceCheck(hum, three, 200)).toEqual({ play: false, steal: null });
    expect(instanceCheck(hum, three.slice(0, 2), 10)).toEqual({ play: true, steal: null });  // under the limit
    expect(instanceCheck({ flags: 0x28, instanceLimit: 2 }, three.slice(0, 2), 0)).toEqual({ play: true, steal: 0 });   // the oldest
    expect(instanceCheck({ flags: 0x08, instanceLimit: 2 }, three.slice(0, 2), 999)).toEqual({ play: false, steal: null });
    expect(instanceCheck({ flags: 0x18, instanceLimit: 0 }, [], 999)).toEqual({ play: false, steal: null });
    expect(instanceCheck({ flags: 0x10, instanceLimit: 1 }, three, 999)).toEqual({ play: true, steal: null });   // no 0x8
  });

  it("LATER 1220 (b): a loop holds the voices of its render's busiest instant, each at its tone's priority (LOOP_VOICE_HOLD_ADAPTATION)", () => {
    expect(LOOP_VOICE_HOLD_ADAPTATION).toBe('busiest instant');
    const t = (priority: number, start: number, end: number) => ({ priority, flags: 0, volume: 0x400, group: 0, start, end });
    // A bed keying chirps one after another over a long hum: at most the hum and one chirp at once.
    const tones = [t(30, 0, 12), t(20, 1, 1.5), t(25, 2, 2.4), t(22, 2.3, 3)];
    expect(busiestTones(tones).map((x) => x.priority).sort()).toEqual([22, 25, 30]);   // 2.3-2.4: the hum and two chirps
    expect(busiestTones([t(10, 0, 1), t(11, 1, 2)]).map((x) => x.priority)).toEqual([10]);  // touching ends do not overlap
    expect(busiestTones([])).toEqual([]);
  });

  it('LATER 1220 (b): a stream asks one voice a channel at 0x7f in its group, unstealable (FUN_0000f5e4 -> FUN_000178b8, IRX D:L9730-9745)', () => {
    expect(STREAM_VOICE_PRIORITY_READING).toBe(0x7f);
    expect(streamAsks(2, 1, 5)).toEqual([{ group: 2, priority: 0x7f, until: 5 }]);
    expect(streamAsks(1, 2, 9)).toEqual([{ group: 1, priority: 0x7f, until: 9 }, { group: 1, priority: 0x7f, until: 9 }]);
    // Two streams' voices are never stolen by a one-shot (0x7e and above, D:L14135).
    const b = new VoiceBudget();
    for (let i = 0; i < 24; i++) b.takeVoices(streamAsks(1, 1, 10), 0, holder());
    expect(b.take(1, 0x7f, 1, 1, 10, holder())).toEqual([]);
  });

  it('LOOP_VOICE_STEAL_PLACEHOLDER: what a loop does when a voice of it is stolen is unread; the page keeps it sounding', () => {
    expect(LOOP_VOICE_STEAL_PLACEHOLDER).toBe('keeps sounding');
  });

  it('the page: Audio.play asks the budget before it sounds a bank one-shot, and a stop ramps out over VOICE_STOP_RAMP_ADAPTATION (a browser adaptation)', () => {
    expect(VOICE_STOP_RAMP_ADAPTATION).toBeGreaterThan(0);
    expect(VOICE_STOP_RAMP_ADAPTATION).toBeLessThanOrEqual(0.02);
    const here = dirname(fileURLToPath(import.meta.url));
    const audio = readFileSync(resolve(here, '../src/audio.ts'), 'utf-8');
    const play = audio.slice(audio.indexOf('  play(name: string, position: Vec3 | null = null'));
    expect(play.indexOf('this.voices.takeVoices(')).toBeGreaterThan(0);
    expect(play.indexOf('this.voices.takeVoices(')).toBeLessThan(play.indexOf('this.out.play('));
    expect(audio).toMatch(/linearRampToValueAtTime\(0, [^)]*VOICE_STOP_RAMP_ADAPTATION/);
  });
});
