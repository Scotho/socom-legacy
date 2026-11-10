// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GAME_FRAME_DT } from '@s2u/scene';
import { noInput, type PadButton } from '../src/gamepad';
import {
  DEFAULT_MODEL, Hud, HUD_LAYOUT, hudLayout, hudPass, OBJECTIVE_MARK_PULSE_READING, ROUND_SCREEN_HIDES, SCOREBOARD_HIDES, START_MENU_HIDES,
  type HudModel,
  HUD_ALIVE_RIGHT_LAYOUT_ADAPTATION,
} from '../src/hud';
import { HUD_LIBRARIES } from '../src/hudAssets';
import {
  aliveCounts, channelIcon, HUD_ALIVE_COUNTS_ADAPTATION, HudVoiceElement, speakerText, tagDrawn, tagTalkSprites, talkMark, voiceBase, voiceCount, voiceCountText, voiceHudFrame,
  VOICE_BUSY_ICON, VOICE_INDICATOR_LOOK_PLACEHOLDER, VOICE_NO_TALK_ICON, VOICE_TAG_ARROW, VOICE_TALK_ICON,
  VOICE_ICON_RAMP, VOICE_TALK_MARK_READING, voiceIconStep, type VoiceElementInput, type VoiceElementView,
} from '../src/hudVoice';
import { mountChat, type MatchChatDeps } from '../src/matchChat';
import { mountTaunts } from '../src/matchTaunts';
import type { ClientEvent, ScoreRow } from '../src/net/protocol';
import type { SoundData } from '../src/soundData';
import type { TauntData } from '../src/tauntData';
import { mountVoice } from '../src/voice/voiceClient';

/**
 * MATCH-05 (web sprint 20, wave 4; research 170 §5.2, §5.3, §3.1, C1, C9; note 227 §2): the round's voice UI -- the HUD's
 * voice element (`FUN_00238f50` D:L85768-85835, ticked by `FUN_00238ac0` D:L85664-85722; the icons `FUN_002393f0`
 * D:L85892-85944 and `FUN_00239250` D:L85840-85887), the talk icon and arrow over the speaker's name tag (`FUN_002269a0`
 * D:L77307-77460), the `hud_talk.tif` compass mark (type 9, `FUN_00211510` D:L68061-68080, D:L68136-68158), and the
 * Chat menu's RADIO and TEAMMATES rows (the tree D:L83601-83617, the rows' functions `FUN_0022f4c0`..`FUN_0022f950`).
 * Fakes only; the bitmaps' sizes are the HUD pin's (`test/golden/hudBitmaps.json`, read off the disc's MP2).
 */

const PIN = JSON.parse(readFileSync(new URL('./golden/hudBitmaps.json', import.meta.url), 'utf8')) as { bitmaps: Record<string, { width: number; height: number }> };
const SIZES: Record<string, { width: number; height: number }> = { ...Object.fromEntries(
  Object.entries(PIN.bitmaps).map(([name, b]) => [name, { width: b.width, height: b.height }])), white: { width: 1, height: 1 } };
const PS2 = { width: 640, height: 448 };
const layout = (over: Partial<HudModel> = {}) => hudLayout(PS2, { ...DEFAULT_MODEL, ...over }, SIZES);
const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');

const input = (over: Partial<VoiceElementInput> = {}): VoiceElementInput => ({
  channel: 0, holder: null, self: 2, talking: false, count: 1, nameOf: (id) => (id === 3 ? 'kilo' : id === 2 ? 'me' : null), ...over,
});

describe('RED 1: the channel icon by base (FUN_002393f0 D:L85892-85944; the textures FUN_00239570 D:L85949-85984)', () => {
  it('0 team, 1 defense, 2 offense, 3 dead zone, 10 spectators; radio off (11) no_talk2; the +4 side block is the room\'s', () => {
    expect([0, 1, 2, 3, 10, 11].map(channelIcon)).toEqual([
      'action_tune_team.tif', 'action_tune_defense.tif', 'action_tune_offense.tif', 'action_dead_zone.tif',
      'action_tune_spectators.tif', VOICE_NO_TALK_ICON,
    ]);
    // A Terrorist's 4..7 read as the base (`voice+0x2c`, before the side bit, D:L211584): channel & 3.
    expect([4, 5, 6, 7].map(channelIcon)).toEqual([0, 1, 2, 3].map(channelIcon));
    expect([4, 5, 6, 7, 10, 11].map(voiceBase)).toEqual([0, 1, 2, 3, 10, 11]);
    // The lobby's 9 and a channel not yet told draw no icon (the switch's default: no texture, hidden).
    expect([channelIcon(9), channelIcon(null)]).toEqual([null, null]);
    expect(VOICE_NO_TALK_ICON).toBe('action_no_talk2.tif');
  });

  it('the element takes its icon from the room\'s voiceFloor.channel; the HUD libraries read every icon', () => {
    const el = new HudVoiceElement();
    expect(el.tick(0, input({ channel: 6 })).icon).toBe('action_tune_offense.tif');
    expect(el.tick(0, input({ channel: 11 })).icon).toBe('action_no_talk2.tif');
    for (const t of ['action_tune_team.tif', 'action_tune_defense.tif', 'action_tune_offense.tif', 'action_dead_zone.tif',
      'action_tune_spectators.tif', 'action_no_talk2.tif', 'action_ok_talk2.tif', 'action_channel_busy.tif']) {
      expect(HUD_LIBRARIES.HUD, t).toContain(t);
    }
    expect(HUD_LIBRARIES.HUD2).toContain('hud_talk.tif');
  });

  it('draws the icon 32x32 at (590, 361) (DAT_003dcbe0..f8), the A_hold01 / B_hold01 frames\' box x 590-621, y 361-392', () => {
    const view = new HudVoiceElement().tick(0, input());
    const q = layout({ voice: view }).quads.filter((x) => x.element === 'voice' && x.texture === 'action_tune_team.tif');
    expect(q).toHaveLength(1);
    expect([q[0]!.x - q[0]!.w / 2, q[0]!.y - q[0]!.h / 2, q[0]!.w, q[0]!.h]).toEqual([590, 361, 32, 32]);
    // AD-7 (C93; was: `VOICE_INDICATOR_LOOK_PLACEHOLDER.iconAlpha`, a fixed 64 / 128): a pass outside the HUD's clock
    // (`AT_REST`) draws the ramp's end, 64 / 128; the HUD's own steps it (RED 10).
    expect(q[0]!.rgba[3]).toBe(VOICE_ICON_RAMP.target / 128);
    expect(HUD_LAYOUT.voice.icon).toEqual({ x: 590, y: 361, w: 32, h: 32 });
  });
});

describe('RED 2: the number beside the icon (voice+0x5c; LATER 77)', () => {
  it('"%d" in 0..99, "?" outside (D:L85710-85717, S:0x3e6750 / 0x3e6758)', () => {
    expect([0, 1, 99, 100, -1].map(voiceCountText)).toEqual(['0', '1', '99', '?', '?']);
  });

  // LATER 77 (research 227 §2.11; the merge controller's simulation-track call, 2026-10-21): the original draws
  // `voice+0x5c` as it stands (`FUN_00238ac0` D:L85707-85715) -- 0 from the voice object's init (`FUN_00310080`
  // D:L211754), refreshed each voice tick only when the library answers for the page's channel (`FUN_0030ec10` D:L211004
  // -> `FUN_006432c8` D:L556962-556990, which writes nothing on a miss) -- so 0 before the first answer, and the last
  // channel's count until the new one answers; never an estimate from the page's own rows (retired).
  it('LATER 77: before the room\'s first word, 0; after a channel change, the last count until the new channel\'s word', () => {
    expect(voiceCount(0, null, 0)).toBe(0);
    expect(voiceCount(0, { channel: 0, members: 3 }, 0)).toBe(3);
    expect(voiceCount(2, { channel: 0, members: 3 }, 3), 'switched to OFFENSE: TEAM\'s 3 until its word').toBe(3);
    expect(voiceCount(2, { channel: 2, members: 1 }, 3)).toBe(1);
    const rows: ScoreRow[] = [
      { id: 2, name: 'me', team: 'seal', kills: 0, deaths: 0, score: 0, alive: true, ping: 0 },
      { id: 3, name: 'kilo', team: 'seal', kills: 0, deaths: 0, score: 0, alive: true, ping: 0 },
    ];
    const el = new HudVoiceElement();
    const frame = (channel: number, members: { channel: number; members: number } | null) => voiceHudFrame(el, 0, {
      voice: { channel, holder: null, talking: false, members },
      self: { id: 2, team: 'seal' }, rows, spectators: 0, nameOf: () => null, at: () => null, own: null,
    }) && String(el.members);   // HUD-ALIVE (OT.R117): the original's count is kept on the element; the box draws the alive counts
    expect(frame(0, null), 'two SEALs in the rows: no estimate, the init\'s 0').toBe('0');
    expect(frame(0, { channel: 0, members: 2 })).toBe('2');
    expect(frame(2, { channel: 0, members: 2 }), 'the old channel\'s count kept').toBe('2');
    expect(frame(2, { channel: 2, members: 4 })).toBe('4');
  });

  it('AD-14 (C92): the room\'s word is the number -- its own channel\'s members, itself included (voice+0x5c, FUN_00623ae8 D:L211004)', () => {
    expect(voiceCount(0, { channel: 0, members: 4 }, 0)).toBe(4);
    expect(voiceCount(11, { channel: 11, members: 3 }, 0)).toBe(3);   // radio off's 11 counts all on it
    expect(voiceCount(7, { channel: 7, members: 2 }, 0)).toBe(2);     // the Terrorists' dead zone
    expect(voiceCount(10, { channel: 10, members: 1 }, 0)).toBe(1);   // the others' RADIO OFF: not on 10
    // A word for another channel (the page's `voiceFloor` came first, its count is on the way) is not this channel's:
    // the last count stands (LATER 77).
    expect(voiceCount(2, { channel: 0, members: 4 }, 4)).toBe(4);
    expect(voiceCount(2, null, 0)).toBe(0);
  });

  it('AD-14 (C92): the old 2/2/2 -- identical rows, the room\'s word -- is distinct per channel: TEAM 2, DEFENSE 1, OFFENSE 3', () => {
    const rows: ScoreRow[] = [2, 3, 4, 6, 7, 8].map((id) => ({ id, name: `p${id}`, team: 'seal', kills: 0, deaths: 0, score: 0, alive: true, ping: 0 }));
    const word: Record<number, number> = { 0: 2, 1: 1, 2: 3 };   // the room: me and kilo on TEAM, one on DEFENSE, three on OFFENSE
    const view = (channel: number) => { const el = new HudVoiceElement(); voiceHudFrame(el, 0, {
      voice: { channel, holder: null, talking: false, members: { channel, members: word[channel]! } },
      self: { id: 2, team: 'seal' }, rows, spectators: 0, nameOf: () => null, at: () => null, own: null,
    }); return String(el.members); };   // HUD-ALIVE (OT.R117): the original's count, kept on the element
    expect([0, 1, 2].map(view)).toEqual(['2', '1', '3']);
  });

  it('AD-14: the voice client reports the room\'s word as its link (the NetClient) keeps it; null before one', () => {
    const link = { id: 2, send: () => {}, sendVoice: () => {}, voiceMembers: null as { channel: number; members: number } | null };
    const v = mountVoice({ net: () => ({ client: link }), tuners: () => ({ headset: 0.75 }), permission: async () => null, microphoneOn: () => true });
    expect(v.state().members).toBeNull();
    link.voiceMembers = { channel: 0, members: 3 };
    expect(v.state().members).toEqual({ channel: 0, members: 3 });
    v.dispose();
  });

  it('the count on its 16x16 box (582-598 x 359-375, black at alpha 50), centred on x 589, baseline 371, scale 0.8: the frames\' "1"', () => {
    const q = layout({ voice: new HudVoiceElement().tick(0, input({ count: 1 })) }).quads.filter((x) => x.element === 'voice');
    const box = q.find((x) => x.texture === 'white')!;
    expect([box.x - box.w / 2, box.y - box.h / 2, box.w, box.h]).toEqual([582, 359, 16, 16]);
    expect(box.rgba).toEqual([0, 0, 0, 50 / 128]);
    expect(HUD_LAYOUT.voice.count).toEqual({ x: 589, y: 371, scale: 0.8, align: 'centre' });
    const glyphs = q.filter((x) => x.texture === 'font_text_01.tif' && x.rgba[0] === 1);
    expect(glyphs.length).toBe(1);
    const g = glyphs[0]!;
    // The "1"'s ink on A_hold01 / B_hold01: x 587-590, y 361-370 (read by eye, 8x crops); the glyph's cell holds it.
    expect(g.x - g.w / 2).toBeLessThanOrEqual(587);
    expect(g.x + g.w / 2).toBeGreaterThanOrEqual(590);
  });
});

// HUD-ALIVE (OT.R117; a browser adaptation, the owner's chosen deviation -- Craig, 2026-11-09, seat 99): the box's left
// corner shows the SEALs alive and a mirrored right corner the Terrorists alive, from the page's own round state (the
// score rows: alive, on that side; bots are rows, spectators and hostages are not). The original's number here is the
// voice channel's member count (`FUN_00238ac0` D:L85707-85716) and it draws nothing in the right corner; the speaker's
// right-aligned line is untouched.
describe('HUD-ALIVE (OT.R117, a browser adaptation): SEALs alive left, Terrorists alive right', () => {
  const row = (id: number, team: 'seal' | 'terrorist', alive: boolean, bot = false): ScoreRow =>
    ({ id, name: `p${id}`, team, kills: 0, deaths: 0, score: 0, alive, ping: 0, ...(bot ? { bot: true as const } : {}) });
  const ROWS = [row(2, 'seal', true), row(3, 'seal', false), row(4, 'seal', true, true), row(5, 'terrorist', true), row(6, 'terrorist', false)];

  it('aliveCounts: the living of each side in the rows, bots included', () => {
    expect(aliveCounts(ROWS)).toEqual({ seal: 2, terrorist: 1 });
    expect(aliveCounts([])).toEqual({ seal: 0, terrorist: 0 });
  });

  it('voiceHudFrame: the left number is the SEALs alive, the right the Terrorists alive -- not the voice channel\'s count', () => {
    const el = new HudVoiceElement();
    const view = voiceHudFrame(el, 0, {
      voice: { channel: 0, holder: 3, talking: false, members: { channel: 0, members: 7 } },
      self: { id: 2, team: 'seal' }, rows: ROWS, spectators: 4, nameOf: (id) => `p${id}`, at: () => null, own: null,
    }).view;
    expect([view.count, view.right]).toEqual(['2', '1']);
    expect(el.members).toBe(7);                      // the original's count still kept, not drawn
    expect(view.name).toBe('p3');                    // the speaker's line exactly as before
    const dead = voiceHudFrame(new HudVoiceElement(), 0, {
      voice: { channel: 0, holder: null, talking: false }, self: null,
      rows: ROWS.map((r) => ({ ...r, alive: false })), spectators: 0, nameOf: () => null, at: () => null, own: null,
    }).view;
    expect([dead.count, dead.right]).toEqual(['0', '0']);
  });

  // The review's F1: the original's no-rewrite rule while the holder is unnamed (D:L85683-85684) is the original's number's
  // (kept on the element); the alive counts are ours and follow the rows every frame.
  it('both counts follow the rows every frame, even while a holder no slot names holds the channel', () => {
    const el = new HudVoiceElement();
    const frame = (rows: ScoreRow[]) => voiceHudFrame(el, 0, {
      voice: { channel: 0, holder: 9, talking: false, members: { channel: 0, members: 3 } },
      self: { id: 2, team: 'seal' }, rows, spectators: 0, nameOf: (id) => (id === 9 ? null : `p${id}`), at: () => null, own: null,
    }).view;
    expect([frame(ROWS).count, frame(ROWS).right]).toEqual(['2', '1']);
    const later = frame(ROWS.map((r) => (r.id === 2 || r.id === 5 ? { ...r, alive: false } : r)));
    expect([later.count, later.right]).toEqual(['1', '0']);   // a SEAL and a Terrorist died: both move
    expect(el.members).toBe(3);
  });

  it('the right number sits on the left box mirrored about the icon (582-598 -> 614-630 x 359-375, centred on x 623)', () => {
    expect(HUD_ALIVE_RIGHT_LAYOUT_ADAPTATION).toEqual({
      count: { x: 623, y: 371, scale: 0.8, align: 'centre' }, countBox: { x: 614, y: 359, w: 16, h: 16 },
    });
    // Mirrored about the icon's centre x 606 (590 + 32 / 2): 2 x 606 - 598 = 614, 2 x 606 - 589 = 623.
    const icon = HUD_LAYOUT.voice.icon, mid = icon.x + icon.w / 2;
    expect(2 * mid - (HUD_LAYOUT.voice.countBox.x + HUD_LAYOUT.voice.countBox.w)).toBe(614);
    expect(2 * mid - HUD_LAYOUT.voice.count.x).toBe(623);
    const q = layout({ voice: { icon: 'action_tune_team.tif', count: '2', right: '1', name: null, talk: null } }).quads.filter((x) => x.element === 'voice');
    const boxes = q.filter((x) => x.texture === 'white').map((b) => [b.x - b.w / 2, b.y - b.h / 2, b.w, b.h]);
    expect(boxes).toEqual([[582, 359, 16, 16], [614, 359, 16, 16]]);
    const glyphs = q.filter((x) => x.texture === 'font_text_01.tif' && x.rgba[0] === 1);
    expect(glyphs).toHaveLength(2);
    expect(glyphs[1]!.x).toBeGreaterThan(614);
    expect(glyphs[1]!.x).toBeLessThan(630);
    // No right number in the view, no right box (the original's element).
    expect(layout({ voice: { icon: null, count: '1', name: null, talk: null } }).quads.filter((x) => x.element === 'voice' && x.texture === 'white')).toHaveLength(1);
  });

  it('is labelled one adaptation, carrying the owner\'s two quotes', () => {
    expect(HUD_ALIVE_COUNTS_ADAPTATION).toBe('seals alive left, terrorists alive right');
    const doc = src('hudVoice.ts');
    expect(doc).toContain('The left label should be added it and tracks the number of seals alive');
    expect(doc).toContain('alive count is a chosen feature addition deviating rom the original');
  });
});

describe('RED 3: the speaker\'s [clan] name only while another holds the floor (FUN_00238ac0, S:0x3e6718)', () => {
  it('another\'s name shows; free or the page\'s own hold shows none; the clan form "[%s] %s"', () => {
    const el = new HudVoiceElement();
    expect(el.tick(0, input({ holder: null })).name).toBeNull();
    expect(el.tick(0, input({ holder: 3 })).name).toBe('kilo');
    expect(el.tick(0, input({ holder: 2, talking: true })).name).toBeNull();
    expect(speakerText('kilo', 'SEAL')).toBe('[SEAL] kilo');
    expect(speakerText('kilo', '')).toBe('kilo');
  });

  it('drawn right-aligned to x 622 (598 + 24, the initializer at 0x3ff680), baseline 352, scale 0.9', () => {
    expect(HUD_LAYOUT.voice.name).toEqual({ x: 622, y: 352, scale: 0.9, align: 'right' });
    const q = layout({ voice: new HudVoiceElement().tick(0, input({ holder: 3 })) }).quads.filter((x) => x.element === 'voice' && x.texture === 'font_text_01.tif');
    expect(Math.max(...q.map((x) => x.x + x.w / 2))).toBeLessThanOrEqual(623);
  });
});

describe('RED 4: talk while the page records, busy while another holds and 1 s after (FUN_00239250, DAT_004145f0 = now + 1.0)', () => {
  it('a fake clock', () => {
    const el = new HudVoiceElement();
    expect(el.tick(0, input()).talk).toBeNull();
    expect(el.tick(1, input({ holder: 2, talking: true })).talk).toBe(VOICE_TALK_ICON);
    expect(el.tick(1.5, input({ holder: 2, talking: false })).talk).toBeNull();      // released: not recording, nobody else
    expect(el.tick(2, input({ holder: 3 })).talk).toBe(VOICE_BUSY_ICON);
    expect(el.tick(2.5, input({ holder: null })).talk).toBe(VOICE_BUSY_ICON);   // the hold
    expect(el.tick(3, input({ holder: null })).talk).toBe(VOICE_BUSY_ICON);     // now <= deadline
    expect(el.tick(3.01, input({ holder: null })).talk).toBeNull();
    expect([VOICE_TALK_ICON, VOICE_BUSY_ICON]).toEqual(['action_ok_talk2.tif', 'action_channel_busy.tif']);
  });

  it('the talk / busy icon at (545, 361), 32x32 (DAT_003dcc00 / 0x3dcc08)', () => {
    const view = new HudVoiceElement().tick(0, input({ holder: 3 }));
    const q = layout({ voice: view }).quads.find((x) => x.texture === VOICE_BUSY_ICON)!;
    expect([q.x - q.w / 2, q.y - q.h / 2, q.w, q.h]).toEqual([545, 361, 32, 32]);
  });
});

describe('RED 5: the name tag\'s talk icon and arrow, only on a drawn tag, for the holder only (FUN_002269a0)', () => {
  const tag = { record: true, query: true, bit5c: true, self: false, metric: 1, teamMask: true, flag20000: false, x: 300, y: 200, top: 20 };
  it('a tag is drawn within FUN_00548050 < 5.0, sharing the team mask, flag 0x20000 clear, on screen (D:L77376-77412)', () => {
    expect(tagDrawn(tag)).toBe(true);
    // The review's F3: the type-2 actor's player record (FUN_0029ed20), FUN_00315580(record, 2), the record's +0x5c bit 0 (D:L77375-77380).
    expect(tagDrawn({ ...tag, record: false })).toBe(false);
    expect(tagDrawn({ ...tag, query: false })).toBe(false);
    expect(tagDrawn({ ...tag, bit5c: false })).toBe(false);
    expect(tagDrawn({ ...tag, metric: 5 })).toBe(false);
    expect(tagDrawn({ ...tag, self: true })).toBe(false);
    expect(tagDrawn({ ...tag, teamMask: false })).toBe(false);
    expect(tagDrawn({ ...tag, flag20000: true })).toBe(false);
    expect(tagDrawn({ ...tag, x: 600 })).toBe(false);
    expect(tagDrawn({ ...tag, x: 0 })).toBe(false);
    expect(tagDrawn({ ...tag, y: 20 })).toBe(false);
    expect(tagDrawn({ ...tag, y: 428 })).toBe(false);
  });

  it('the arrow 32x32 centred over the tag, 10 above it and drawn flipped; the talk icon 32x32 7 into the arrow\'s top (D:L77434-77443)', () => {
    expect(tagTalkSprites({ id: 3, x: 300, y: 200 }, 3, 2)).toEqual([
      { texture: VOICE_TAG_ARROW, x0: 284, y0: 190, x1: 316, y1: 158, rgb: [40, 96, 110], alpha: 64 },
      { texture: VOICE_TALK_ICON, x0: 284, y0: 133, x1: 316, y1: 165, rgb: [128, 128, 128], alpha: 64 },
    ]);
    expect(tagTalkSprites({ id: 4, x: 300, y: 200 }, 3, 2)).toEqual([]);   // not the holder
    expect(tagTalkSprites({ id: 3, x: 300, y: 200 }, null, 2)).toEqual([]);
    expect(tagTalkSprites({ id: 2, x: 300, y: 200 }, 2, 2)).toEqual([]);   // the page's own hold: FUN_0030e790 false
  });
});

describe('RED 6: the hud_talk.tif compass mark at the holder, pulsing, hidden past 900 units (C9)', () => {
  it('type 9, (32, 62, 62) (FUN_002126f0\'s table +0x10c), shown while another holds and his body is known, out past 900 (DAT_003dc518) in the xz plane', () => {
    expect(VOICE_TALK_MARK_READING).toMatchObject({ type: 9, bitmap: 'hud_talk.tif', rgb: [32, 62, 62], hideBeyond: 900 });
    expect(talkMark(3, 2, [900, 50, 0], [0, 0, 0])).toEqual({ bitmap: 'hud_talk.tif', x: 900, z: 0, pulse: true });
    expect(talkMark(3, 2, [900.5, 0, 0], [0, 0, 0])).toBeNull();
    expect(talkMark(3, 2, [0, 5000, 100], [0, 0, 0])).not.toBeNull();   // the height left out (D:L68135: the vector's y dropped)
    expect(talkMark(2, 2, [1, 0, 1], [0, 0, 0])).toBeNull();            // the page's own hold
    expect(talkMark(null, 2, [1, 0, 1], [0, 0, 0])).toBeNull();
    expect(talkMark(3, 2, null, [0, 0, 0])).toBeNull();                 // his body not known
  });

  it('drawn on the compass by the marks\' rule, at the types 1-13 pulse (64..128, OBJECTIVE_MARK_PULSE_READING)', () => {
    const hud = new Hud();
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 200; i++) { hud.step(1 / 60); const a = hud.timing().marks!; lo = Math.min(lo, a); hi = Math.max(hi, a); }
    expect([lo, hi]).toEqual([OBJECTIVE_MARK_PULSE_READING.min / 128, OBJECTIVE_MARK_PULSE_READING.max / 128]);
    const timing = { fade: 1, stance: 0, pulse: 0, marks: 0.75 };
    const q = hudLayout(PS2, { ...DEFAULT_MODEL, position: [0, 0], talkMarks: [{ bitmap: 'hud_talk.tif', x: 0, z: -50, pulse: true }] }, SIZES, timing)
      .quads.filter((x) => x.texture === 'hud_talk.tif');
    expect(q).toHaveLength(1);
    expect(q[0]!.rgba).toEqual([32 / 128, 62 / 128, 62 / 128, 0.75]);
    hud.setTalkMarks([{ bitmap: 'hud_talk.tif', x: 1, z: 2, pulse: true }]);
    expect(hud.state().model.talkMarks).toEqual([{ bitmap: 'hud_talk.tif', x: 1, z: 2, pulse: true }]);
  });
});

// ---- the Chat menu's RADIO and TEAMMATES (research 302 §3; the tree D:L83601-83617) ----

const DATA = { defaults: ['T1', 'T2', 'T3', 'T4', 'T5'], captions: {}, vocals: { seal: [], terrorist: [] }, messages: ['', '', '', '', ''], tactical: { seal: [], terrorist: [] } } as unknown as TauntData;
const ROWS: ScoreRow[] = [
  { id: 2, name: 'me', team: 'seal', kills: 0, deaths: 0, score: 0, alive: true, ping: 0 },
  { id: 3, name: 'kilo', team: 'seal', kills: 0, deaths: 0, score: 0, alive: true, ping: 0 },
  { id: 4, name: 'lima', team: 'seal', kills: 0, deaths: 0, score: 0, alive: false, ping: 0 },
  { id: 5, name: 'mike', team: 'terrorist', kills: 0, deaths: 0, score: 0, alive: true, ping: 0 },
];

function rig(o: { channel?: number | null; spectator?: boolean; holder?: number | null } = {}) {
  let now = 0;
  const sent: Record<string, unknown>[] = [], played: string[] = [], radio: unknown[] = [], mutes: [number, boolean][] = [];
  const muted = new Set<number>();
  const gate = { inMatch: true, alive: true, cameraOnSelf: true, spectator: !!o.spectator };
  const net = { client: { id: 2, team: 'seal', send: (e: Record<string, unknown>) => { sent.push(e); } }, rows: ROWS, gate: () => gate, gameType: () => 1, votingToRemove: () => false };
  const voice: NonNullable<ReturnType<NonNullable<MatchChatDeps['voice']>>> = {
    state: () => ({ sent: 0, heard: 0, speaker: null, holder: o.holder ?? null, toneLevel: 0, headset: true, channel: o.channel === undefined ? 0 : o.channel, talking: false }),
    radio: (ask) => { radio.push(ask); },
    mute: (id, on) => { mutes.push([id, on]); if (on) muted.add(id); else muted.delete(id); },
    muted: (id) => muted.has(id),
  };
  const chat = mountChat({
    net: () => net as never, hud: { postMessage: () => {} }, audio: { playStream: () => 'played', hasStream: () => true },
    messages: () => [], side: () => 'seal', character: () => 0, voice: () => voice,
  });
  chat.setData({ taunts: DATA } as unknown as SoundData);
  const t = mountTaunts({
    net: () => net as never, hud: { postMessage: () => {} },
    audio: { play: (name) => { played.push(name); return true as never; }, playStream: () => 'played' },
    custom: () => [], otherMenu: () => false, release: () => {}, clock: () => now, entries: chat.entries,
  });
  t.setData({ taunts: DATA } as unknown as SoundData);
  const frame = (held: PadButton[], dt = 0.05) => { now += dt; return t.pad(new Set(held), noInput()); };
  const tap = (b: PadButton) => { frame([b], 0.25); frame([], 0.05); };
  const open = (root: number) => { tap('Circle'); for (let i = 0; i < root; i++) tap('Down'); tap('Cross'); };
  const labels = () => t.state().columns.at(-1)?.rows.map((r) => r.label) ?? [];
  const advance = (s: number) => { now += s; };
  return { chat, t, sent, played, radio, mutes, tap, open, labels, advance };
}

describe('RED 7: RADIO > ACTIVE CHANNEL (TEAM 0, OFFENSE 2, DEFENSE 1: C1) and RADIO ON:OFF; a spectator\'s RADIO only', () => {
  it('the rows in the tree\'s order with the ELF\'s help lines; each ACTIVE CHANNEL row sends voiceRadio {active}', () => {
    const r = rig();
    r.open(2);
    expect(r.labels()).toEqual(['ACTIVE CHANNEL', 'RADIO OFF']);
    expect(r.t.state().columns[0]!.rows.map((x) => x.help)).toEqual(['Set the active radio channel', 'Radio (On, Off)']);
    r.tap('Cross');
    expect(r.labels()).toEqual(['TEAM', 'OFFENSE', 'DEFENSE']);
    expect(r.t.state().columns[1]!.rows.map((x) => x.help)).toEqual(['Set radio channel to TEAM', 'Set radio channel to OFFENSE ', 'Set radio channel to DEFENSE']);
    for (let row = 0; row < 3; row++) {
      r.advance(6);
      if (row > 0) { r.open(2); r.tap('Cross'); }
      for (let i = 0; i < row; i++) r.tap('Down');
      r.tap('Cross');
    }
    expect(r.radio).toEqual([{ active: 0 }, { active: 2 }, { active: 1 }]);
    expect(r.sent).toEqual([]);   // through the voice client, not the chat's own send
  });

  it('RADIO ON:OFF is labelled by the radio\'s state (FUN_0022f8f0) and toggles it (FUN_0022f880): on -> {on: false}; off (11) -> {on: true}', () => {
    const on = rig({ channel: 4 });
    on.open(2); on.tap('Down'); on.tap('Cross');
    const off = rig({ channel: 11 });
    off.open(2);
    expect(off.labels()).toEqual(['ACTIVE CHANNEL', 'RADIO ON']);
    off.tap('Down'); off.tap('Cross');
    expect([on.radio, off.radio]).toEqual([[{ on: false }], [{ on: true }]]);
  });

  it('a spectator\'s tree holds RADIO > RADIO ON:OFF only (D:L83641-83645); every other root gives nothing', () => {
    const r = rig({ spectator: true, channel: 10 });
    expect(r.chat.entries(2).map((e) => e.label)).toEqual(['RADIO OFF']);
    expect([0, 3, 4].map((root) => r.chat.entries(root).length)).toEqual([0, 0, 0]);
  });

  it('AD-11: a spectator\'s Circle opens its menu on RADIO alone; RADIO > RADIO OFF turns the radio off (FUN_0022f880), then RADIO ON back on', () => {
    const r = rig({ spectator: true, channel: 10 });
    r.open(0);                                                         // the cursor opens on RADIO: no Down to walk
    expect([r.t.state().roots, r.t.state().root, r.labels()]).toEqual([[2], 2, ['RADIO OFF']]);
    r.tap('Cross');
    expect([r.radio, r.t.isOpen()]).toEqual([[{ on: false }], false]);
    const off = rig({ spectator: true, channel: 11 });
    off.open(0);
    expect(off.labels()).toEqual(['RADIO ON']);
    off.tap('Cross');
    expect(off.radio).toEqual([{ on: true }]);
    expect([r.sent, off.sent]).toEqual([[], []]);                      // through the voice client, not the chat's own send
  });

  it('the voice client sends voiceRadio {on} and {active: 0..2} through its link, nothing outside 0..2 (W20.R4, FUN_0022f950)', () => {
    const sent: ClientEvent[] = [];
    const v = mountVoice({ net: () => ({ client: { id: 2, send: (e: ClientEvent) => { sent.push(e); }, sendVoice: () => {} } }), tuners: () => ({ headset: 0.75 }), permission: async () => null, microphoneOn: () => true });
    v.radio({ active: 2 }); v.radio({ on: false }); v.radio({ active: 3 as never }); v.radio({ active: -1 as never });
    expect(sent).toEqual([{ type: 'voiceRadio', active: 2 }, { type: 'voiceRadio', on: false }]);
    v.netDeps().voiceFloor({ type: 'voiceFloor', channel: 6, holder: null });
    expect(v.state()).toMatchObject({ channel: 6, talking: false });
    v.mute(3, true);
    expect([v.muted(3), v.muted(4)]).toEqual([true, false]);
    v.dispose();
  });

  it('without a voice client the two roots stay parked, as before', () => {
    const chat = mountChat({ net: () => null, hud: { postMessage: () => {} }, audio: { playStream: () => 'played', hasStream: () => true }, messages: () => [], side: () => 'seal', character: () => 0 });
    expect([chat.entries(2), chat.entries(3)]).toEqual([[], []]);
  });
});

describe('RED 8: TEAMMATES > a teammate of the same side > MUTE ON:OFF -- the listener\'s, nothing sent (170 §5.3)', () => {
  it('lists the side\'s players but the page, the dead among them (FUN_0022f5b0 has no life test; FUN_002c2fd0 is the spectator test), then VOTE REMOVE and MUTE OFF; MUTE calls mute(id, on), no send', () => {
    const r = rig();
    r.open(3);
    expect(r.labels()).toEqual(['kilo', 'lima']);
    expect(r.t.state().columns[0]!.rows[1]!.help).toBe('Player 2');
    expect(r.t.state().columns[0]!.rows[0]!.help).toBe('Player 1');
    r.tap('Cross');
    expect(r.labels()).toEqual(['VOTE REMOVE', 'MUTE OFF']);
    r.tap('Down'); r.tap('Cross');
    expect(r.mutes).toEqual([[3, true]]);
    r.advance(6); r.open(3); r.tap('Cross');
    expect(r.labels()).toEqual(['VOTE REMOVE', 'MUTE ON']);
    r.tap('Down'); r.tap('Cross');
    expect(r.mutes).toEqual([[3, true], [3, false]]);
    expect(r.sent).toEqual([]);
    expect(r.radio).toEqual([]);
  });
});

describe('RED 9: no row mark anywhere; no sound on any of it', () => {
  it('the holder\'s TEAMMATES row is his plain name; the menu plays only its own .TCM_ sounds', () => {
    const r = rig({ holder: 3 });
    r.open(3);
    expect(r.labels()).toEqual(['kilo', 'lima']);
    expect(new Set(r.played)).toEqual(new Set(['.TCM_SLIDE', '.TCM_SELECT']));
  });

  it('the element, the tag and the marker play nothing: hudVoice.ts holds no audio', () => {
    expect(src('hudVoice.ts')).not.toMatch(/audio|playStream|\.play\(|\.TCM_/i);
  });

  it('a round screen hides the element (no voice widget on the round or final screens, 170 §5.2)', () => {
    expect(ROUND_SCREEN_HIDES.has('voice')).toBe(true);
    const model = { ...DEFAULT_MODEL, voice: new HudVoiceElement().tick(0, input()), roundScreen: { kind: 'roundComplete', secondsLeft: 5, elapsed: 0, winner: null, wins: { seal: 0, terrorist: 0 }, rows: [] } } as unknown as HudModel;
    expect(hudPass(PS2, model, SIZES, { fade: 1, stance: 0, pulse: 0 }, false, null).quads.some((q) => q.element === 'voice')).toBe(false);
  });
});

// ---- AD-7 (web sprint 40; the reconciliation's C87 and C93; note 227 §2.1) ----

const VIEW: VoiceElementView = { icon: 'action_tune_team.tif', count: '1', name: 'kilo', talk: VOICE_BUSY_ICON };
const voiceQuads = (model: Partial<HudModel>, timing: Parameters<typeof hudLayout>[3] = { fade: 1, stance: 0, pulse: 0 }) =>
  hudPass(PS2, { ...DEFAULT_MODEL, voice: VIEW, ...model }, SIZES, timing, false, null).quads.filter((q) => q.element === 'voice');

describe('RED 10 (C87): SELECT\'s board and SPECTATOR HUD off hide the voice element; START does not', () => {
  // `FUN_001f7ff0` D:L56808-56811 calls the info box's `+0x18` -- the table 0x405b40 + 0x18 holds 0x238420 (read off the
  // ELF) -- and `FUN_00238420` D:L85523 hides its `+0x390`, the voice element (`FUN_00238f50` D:L85656).
  it('the scoreboard\'s set takes voice; START\'s does not (PAR-97); the round screen\'s still does', () => {
    expect(SCOREBOARD_HIDES.has('voice')).toBe(true);
    expect(START_MENU_HIDES.has('voice')).toBe(false);
    expect(ROUND_SCREEN_HIDES.has('voice')).toBe(true);
  });

  it('SELECT\'s board up hides every voice quad; its release draws them again', () => {
    expect(voiceQuads({}).length).toBeGreaterThan(0);
    expect(voiceQuads({ scoreboard: true })).toEqual([]);
    expect(voiceQuads({ scoreboard: false })).toEqual(voiceQuads({}));
  });

  it('SPECTATOR HUD off hides them; on draws them', () => {
    expect(voiceQuads({ spectatorHud: false })).toEqual([]);
    expect(voiceQuads({ spectatorHud: true })).toEqual(voiceQuads({}));
  });

  it('the START menu\'s open keeps them (the hide-all skips the info box in control state 3, D:L56344-56347)', () => {
    expect(voiceQuads({ startMenu: true })).toEqual(voiceQuads({}));
  });

  it('a round screen still hides them', () => {
    const roundScreen = { kind: 'roundComplete', secondsLeft: 5, elapsed: 0, winner: null, wins: { seal: 0, terrorist: 0 }, rows: [] };
    expect(voiceQuads({ roundScreen } as unknown as Partial<HudModel>)).toEqual([]);
  });
});

describe('RED 11 (C93): the two icon sprites fade in from 0 by 2 a game frame to 64 (FUN_00238d00, FUN_003642d0)', () => {
  const step = (hud: Hud, frames: number) => { for (let i = 0; i < frames; i++) hud.step(GAME_FRAME_DT); };
  const alphas = (hud: Hud) => hud.timing().voice!;

  it('the law: alpha 0, step 2.0, target 64 (D:L85738-85748); next = alpha + step, held at the target', () => {
    expect(VOICE_ICON_RAMP).toEqual({ from: 0, step: 2, target: 64 });
    expect(voiceIconStep(0, 1)).toBe(2);
    expect(voiceIconStep(0, 31)).toBe(62);
    expect(voiceIconStep(0, 32)).toBe(64);
    expect(voiceIconStep(63, 1)).toBe(64);
    expect(voiceIconStep(64, 1)).toBe(64);
    expect(voiceIconStep(0, 0.5)).toBe(1);   // MISSION R8: a frame's step x dt / GAME_FRAME_DT
    let a = 0;
    for (let i = 0; i < 100; i++) { a = voiceIconStep(a, 1); expect(a).toBeLessThanOrEqual(64); }
  });

  it('the HUD holds both alphas: 0 made, 2 after the first shown frame, 64 after 32, never above', () => {
    const hud = new Hud();
    expect(alphas(hud)).toEqual({ icon: 0, talk: 0 });
    hud.setVoice({ ...VIEW, talk: null });
    step(hud, 1);
    expect(alphas(hud)).toEqual({ icon: 2 / 128, talk: 0 });
    step(hud, 31);
    expect(alphas(hud).icon).toBe(64 / 128);
    step(hud, 40);
    expect(alphas(hud)).toEqual({ icon: 64 / 128, talk: 0 });
  });

  it('a hidden icon keeps its alpha and a re-shown one goes on from it (+0x18 / +0x1c touch the drawn bit only)', () => {
    const hud = new Hud();
    hud.setVoice({ ...VIEW, talk: VOICE_TALK_ICON });
    step(hud, 10);
    expect(alphas(hud).talk).toBe(20 / 128);
    hud.setVoice({ ...VIEW, talk: null });
    step(hud, 50);
    expect(alphas(hud).talk).toBe(20 / 128);
    hud.setVoice({ ...VIEW, talk: VOICE_BUSY_ICON });   // another texture, the same sprite (FUN_003646d0 sets no alpha)
    step(hud, 1);
    expect(alphas(hud).talk).toBe(22 / 128);
  });

  it('no element, no step; the board\'s hide does not stop it (the update D:L56758 runs before the hide D:L56811)', () => {
    const hud = new Hud();
    step(hud, 5);
    expect(alphas(hud)).toEqual({ icon: 0, talk: 0 });
    hud.setVoice(VIEW);
    hud.setScoreboard(true);
    step(hud, 5);
    expect(alphas(hud)).toEqual({ icon: 10 / 128, talk: 10 / 128 });
  });

  it('a round start puts both back to 0 (FUN_001fb420 D:L57618 -> FUN_00238710 D:L85621 -> FUN_00238d00)', () => {
    const hud = new Hud();
    hud.setVoice(VIEW);
    step(hud, 40);
    hud.startRound({ round: 2, rounds: 11, objective: [] });
    expect(alphas(hud)).toEqual({ icon: 0, talk: 0 });
    step(hud, 1);
    expect(alphas(hud)).toEqual({ icon: 2 / 128, talk: 2 / 128 });
  });

  it('the draw takes each sprite\'s alpha from the HUD\'s timing; no positional motion (motion stays none)', () => {
    const q = voiceQuads({}, { fade: 1, stance: 0, pulse: 0, voice: { icon: 0.25, talk: 0.125 } });
    expect(q.find((x) => x.texture === VIEW.icon)!.rgba).toEqual([1, 1, 1, 0.25]);
    expect(q.find((x) => x.texture === VIEW.talk)!.rgba).toEqual([1, 1, 1, 0.125]);
    const at = voiceQuads({}, { fade: 1, stance: 0, pulse: 0, voice: { icon: 0.5, talk: 0.5 } });   // the places whatever the alpha
    expect(at.map((x) => [x.x, x.y, x.w, x.h])).toEqual(q.map((x) => [x.x, x.y, x.w, x.h]));
    expect(VOICE_INDICATOR_LOOK_PLACEHOLDER).toEqual({ motion: 'none' });
  });
});

describe('LATER 77 (the review\'s F1): the count is 0 again at a match\'s start on /testroom\'s page', () => {
  // A source pin, not a unit test: `main.ts` `connectNet` is not reachable from one (the page's module boots on import).
  // The original zeroes `voice+0x5c` at each session's start (`FUN_00310080` D:L211754, run from `FUN_002b83e0`
  // D:L158840-158881); `main.ts` keeps one `HudVoiceElement` for the page's life, so its count is reset where the
  // match's end mounts the fresh voice client. `matchMount.ts` makes its element per mount and needs none.
  // #395 review F1: connectNet's teardown is `leaveRoom`, which it calls first -- the remount and its reset live there.
  it('connectNet resets voiceEl.members to 0 right after the fresh voice client (in leaveRoom, which it calls)', () => {
    const main = src('main.ts');
    const connect = main.slice(main.indexOf('function connectNet('), main.indexOf('\n}\n', main.indexOf('function connectNet(')));
    expect(connect).toContain('leaveRoom();');
    const body = main.slice(main.indexOf('function leaveRoom('));
    const remount = body.indexOf('voice = mountPageVoice();');
    expect(remount).toBeGreaterThan(0);
    const next = body.slice(remount).split('\n')[1] ?? '';
    expect(next.trim()).toMatch(/^voiceEl\.members = 0;/);
  });
});
