import { describe, expect, it } from 'vitest';
import type { RdrNode } from '@s2u/archive';
import { frontEndSoundTable, soundHash } from '@s2u/sound';
import type { ZAnimSoundCommand, ZAnimUiCommand } from '../../src/zanimRuntime';
import { STREAM_NAME_SLOT_READING, UiSoundCues, streamNameSlot, type UiSoundOutput, type UiSoundPlay } from '../../src/sounds';

/**
 * The menus' music through PLAT-23's cues (MENU-MUSIC; web research 152 §2): the zAnim `SOUND` command of a `MUS_`
 * name is a stream play carrying what `FUN_00343140` hands `FUN_00342240` -- the volume word, the command's pan (-1:
 * the stream's own) -- and the name slot whose previous voice `FUN_002659c0` stops before a new play (D:L112451-112455).
 * `VagStreaming ON` / `OFF` (`FUN_0027a5e0`) reach the output. A synthetic table in the disc's shape; no disc file.
 */
const h = (name: string): string => String(soundHash(name));
const SCRIPT: RdrNode = ['SETS', [
  'HUDUI', [[h('.DINK'), 'ONESHOT', []]],
  'SMUS', [
    [h('MUS_MENU_THEME'), 'ST', ['N1', ['MUUI0001'], 'LOOP', [], 'MUS', []]],
    [h('MUS_ONLINE_MENU'), 'ST', ['N1', ['MUUI0003'], 'LOOP', [], 'MUS', []]],
  ],
]];

function rig() {
  const plays: UiSoundPlay[] = [], log: string[] = [];
  const out: UiSoundOutput = {
    play: (p) => { plays.push(p); log.push(`${p.kind} ${p.resolution.name}`); },
    stopAll: () => log.push('stopAll'), fadeAll: () => log.push('fadeAll'), streaming: (on) => log.push(`streaming ${on}`),
  };
  const cues = new UiSoundCues(frontEndSoundTable(SCRIPT, new Map([['HUDUI', { names: new Map<string, number>() }]])),
    { teletype: '', back: '', selection: '' }, [], out);
  return { cues, plays, log };
}
function sound(anim: string, name: string, flags: number, fill?: (v: DataView) => void): ZAnimSoundCommand {
  const bytes = new Uint8Array(32), v = new DataView(bytes.buffer);
  v.setUint16(4, flags, true);
  fill?.(v);
  return { anim, flags, sound: name, nodeIndex: 0, bytes };
}
const ui = (fn: string, arg: string): ZAnimUiCommand => ({ anim: 'CallMusic', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });

describe('the menus\' music as a SOUND command plays it (FUN_002659c0 -> FUN_00343140)', () => {
  it('dlgWorldOfSOCOM\'s CallMusic: VagStreaming(ON), then SOUND MUS_ONLINE_MENU 0x80 -- a stream play at 0x400, pan -1, in its name slot', () => {
    const t = rig();
    t.cues.VagStreaming(ui('VagStreaming', 'ON'));
    const o = t.cues.sound(sound('CallMusic', 'MUS_ONLINE_MENU', 0x80));
    expect(o.kind).toBe('played');
    expect(t.log).toEqual(['streaming true', 'stream MUS_ONLINE_MENU']);
    const p = t.plays[0]!;
    expect(p.kind).toBe('stream');
    if (p.kind !== 'stream') return;
    expect([p.vol, p.pan, p.slot, p.source]).toEqual([0x400, -1, streamNameSlot('CallMusic', 'MUS_ONLINE_MENU'), 'zanim']);
    expect([p.resolution.object.n1, p.resolution.object.music, p.resolution.object.loop]).toEqual(['MUUI0003', true, true]);
  });

  it('the command\'s pan (0x20) and volume (0x10) reach the play', () => {
    const t = rig();
    t.cues.sound(sound('A', 'MUS_MENU_THEME', 0xb0, (v) => { v.setFloat32(8, 0.5, true); v.setUint16(0xc, 90, true); }));
    const p = t.plays[0]!;
    expect(p.kind === 'stream' ? [p.vol, p.pan] : null).toEqual([0x200, 90]);
  });

  it('the name slot is the animation\'s record of the name (STREAM_NAME_SLOT_READING): two animations, two slots; a code cue none', () => {
    expect(STREAM_NAME_SLOT_READING).toBe('animation and name');
    expect(streamNameSlot('CallMusic', 'MUS_ONLINE_MENU')).not.toBe(streamNameSlot('Call_Music', 'MUS_ONLINE_MENU'));
    const t = rig();
    t.cues.play('MUS_ONLINE_MENU', { volume: 1, pan: -1, pitchMod: 0 }, 'selection');
    const p = t.plays[0]!;
    expect(p.kind === 'stream' ? p.slot : 'none').toBeNull();
  });

  it('VagStreaming OFF reaches the output and clears the flag; a retune (no 0x80) plays nothing', () => {
    const t = rig();
    t.cues.VagStreaming(ui('VagStreaming', 'ON'));
    t.cues.VagStreaming(ui('VagStreaming', 'OFF'));
    expect(t.cues.streamingOn).toBe(false);
    expect(t.cues.sound(sound('A', 'MUS_ONLINE_MENU', 0)).kind).toBe('retune');
    expect(t.log).toEqual(['streaming true', 'streaming false']);
  });
});
