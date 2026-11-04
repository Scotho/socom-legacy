import type { CompassMark } from './hud';
import type { ScoreRow, Team } from './net/protocol';

/**
 * MATCH-05 (web sprint 20, wave 4; research 170 §5.2, §3.1, C1, C9; note 227 §2): the round's three voice indicators,
 * pure -- time is passed in, nothing is drawn or played here (`./hud` draws the element and the mark; NU-9 (c): the name
 * tags and their sprites are `./hudTags` `teamTags` and `./hud` `teamTagLayout`, research 329; was: "the name tags'
 * sprites wait for a tag drawer, note 227 §2.2").
 *
 * - **The HUD's voice element** (made by `FUN_00238f50` D:L85768-85835, ticked by `FUN_00238ac0` D:L85664-85722): the
 *   channel icon by the base (`FUN_002393f0` D:L85892-85944), the number beside it (`voice+0x5c`, `voiceCount`), the
 *   speaker's `[clan] name` while another holds the listener's channel, and the talk / busy icon (`FUN_00239250`
 *   D:L85840-85887) with its 1 s hold.
 * - **Over the speaker's name tag** (`FUN_002269a0` D:L77307-77460): the talk icon and `hud_arrow_off2.tif`, only on a
 *   tag that was drawn (`tagDrawn`), for the holder of the listener's channel only.
 * - **The `WhoIsTalking` mark**: a compass mark of type 9, `hud_talk.tif` (`FUN_00211510` D:L68061-68080, the cut
 *   D:L68132-68158), pulsing at the compass's types 1-13 pulse (`./hud` `OBJECTIVE_MARK_PULSE_READING`).
 *
 * The page knows only its own channel's floor entry (W20.R6): the room's `voiceFloor {channel, holder}`, kept by the
 * voice client (`./voice/voiceClient` `VoiceState`); and (AD-14) its own channel's member count, the room's
 * `voiceMembers`, kept by `./net/client` `NetClient.voiceMembers`. The HUD plays no sound on any of it; the talk grant's
 * cue is the voice client's (`VOICE_TALK_CUE_ADAPTATION`, research 170 §5.4; was `VOICE_TALK_SOUND_READING`, C9, retired).
 */

/** RADIO OFF's channel (`FUN_0030e490`; `FUN_0030e540` D:L210691-210694: the radio is on while the channel is not 11). */
export const VOICE_RADIO_OFF = 11;

/**
 * The channel icon by base (`FUN_002393f0`: `voice+0x2c` 0 -> `+0x84`, 1 -> `+0x8c`, 2 -> `+0x88`, 3 -> `+0x90`, 10 ->
 * `+0x94`), the textures as `FUN_00239570` loads them (S:0x3e67e0, 0x3e6820, 0x3e6800, 0x3e6840, 0x3e6860, read off the
 * ELF): DEFENSE is 1 and OFFENSE 2 (C1).
 */
export const VOICE_CHANNEL_ICONS: Readonly<Record<number, string>> = {
  0: 'action_tune_team.tif', 1: 'action_tune_defense.tif', 2: 'action_tune_offense.tif', 3: 'action_dead_zone.tif',
  10: 'action_tune_spectators.tif',
};
/** The radio off (`FUN_0030e540` false: `+0x80`, S:0x3e67c0). */
export const VOICE_NO_TALK_ICON = 'action_no_talk2.tif';
/** The talk icon while the page records (`FUN_00239250`'s `+0x84`, S:0x3e6780; the tag's, S:0x3e5500). */
export const VOICE_TALK_ICON = 'action_ok_talk2.tif';
/** The busy icon while another holds and 1 s after (`FUN_00239250`'s `+0x80`, S:0x3e6760). */
export const VOICE_BUSY_ICON = 'action_channel_busy.tif';
/** The arrow over the speaker's tag (`FUN_00227340` D:L77547-77556, S:0x3e5520). */
export const VOICE_TAG_ARROW = 'hud_arrow_off2.tif';
/** The busy icon's hold after another's floor ends, seconds (`FUN_00239250` D:L85852: `DAT_004145f0 = now + 1.0`). */
export const VOICE_BUSY_HOLD_SECONDS = 1.0;

/**
 * VOICE_INDICATOR_LOOK_PLACEHOLDER (research 170 §10, OQ-3; narrowed by AD-7, research 227 §3): how each indicator looks
 * and moves while someone talks -- no frame of a talker exists. The round's two icon sprites' alpha is read now
 * (`VOICE_ICON_RAMP`); what stays open is any positional motion, none read, so none is drawn. (Was: `iconAlpha: 64 / 128`,
 * the sprites drawn at rest at a fixed 64.)
 */
export const VOICE_INDICATOR_LOOK_PLACEHOLDER = { motion: 'none' } as const;

/**
 * AD-7 (C93; research 227 §2.8): the alpha of the element's two icon sprites, the channel icon (`voice+0x20`) and the
 * talk / busy icon (`voice+0xc0`), in GS units (128 opaque). Each is made at alpha 0 with a step 2.0, a target 64 and its
 * step flag set: `FUN_00239570` D:L85958-85963 and `FUN_00238f50` D:L85800-85805 at the element's making, and
 * `FUN_00238d00` D:L85737-85748 at each round's start (`FUN_001fb420` D:L57618 -> `FUN_00238710` D:L85621;
 * `Hud.startRound`). Its call site (`FUN_002393f0` D:L85925-85939, `FUN_00239250` D:L85867-85881) steps it
 * (`voiceIconStep`) on every frame the icon has a texture, then shows it; a frame without one hides it (`+0x18`). Hide
 * and show touch the drawn bit only -- the sprites' tables 0x405c20 and 0x405c90, read off the ELF: `+0x18`
 * `FUN_00364e50` D:L262099, `+0x1c` `FUN_00364e30` D:L262089, each the `+0x14` bit 0x40 alone; the alpha's setter `+0x34`
 * is `FUN_00364860` D:L261835-261836 -- so a hidden icon keeps its alpha and a re-shown one goes on from it; a texture
 * swap (`FUN_003646d0`) sets none either. The element's update runs once a HUD frame (`FUN_001f7ff0` D:L56758 ->
 * `FUN_00238500` D:L85578 -> `FUN_00238ac0` D:L85718-85719; the HUD's frame from `FUN_001ebed0` D:L50856).
 */
export const VOICE_ICON_RAMP = { from: 0, step: 2, target: 64 } as const;

/**
 * `FUN_003642d0` (D:L261617-261631) for the icons' positive step over `frames` game frames: `alpha + step`, held at the
 * target past it, and at 128 above that. MISSION R8: a frame's step x dt / `GAME_FRAME_DT` at the page's rate (the
 * sub-frame stair-steps not reproduced); one call of one frame is the original's step.
 */
export function voiceIconStep(alpha: number, frames: number): number {
  const next = alpha + VOICE_ICON_RAMP.step * frames;
  return next <= VOICE_ICON_RAMP.target ? Math.min(next, 128) : VOICE_ICON_RAMP.target;
}

/**
 * VOICE_TALK_MARK_READING (research 170 C9, R2-AV §1.11; re-read here): the `WhoIsTalking` mark is the compass's mark
 * type 9 -- its bitmap slot `+0x2c` `hud_talk.tif` (S:0x3e4598, `FUN_002126f0` D:L68613) and its colour row `+0x10c`
 * (32, 62, 62) (D:L68703-68705) -- placed at the holder's actor while another holds the listener's channel and the
 * actor is known (`FUN_00211510` D:L68061-68080), and online cut past 900 units (`DAT_003dc518` = 900.0, read off the
 * ELF; the jump table 0x3e44b0 sends type 9 to the test, research 190) by the distance in the ground plane (D:L68132-68137
 * keep the vector's x and z, its y dropped). Types 1-13 pulse (`OBJECTIVE_MARK_PULSE_READING`).
 */
export const VOICE_TALK_MARK_READING = { type: 9, bitmap: 'hud_talk.tif', rgb: [32, 62, 62], hideBeyond: 900, plane: 'xz' } as const;

/**
 * VOICE-LATE (B; research 226 §3.2): who the talker's indicators name -- the speaker whose voice the page is playing
 * now, else the holder of the listener's channel's floor entry; never the page itself. The original's element and bar
 * read the floor entry (`FUN_00238ac0` D:L85678-85696 and `FUN_00239250` D:L85850-85852 through `FUN_0030e790`
 * D:L210828-210840; the lobby's bar, `FUN_0027cbf0`, research 170 §5.1), and its receive path decoded each message the
 * moment it came, only on the listener's channel (`FUN_0030f7e0` D:L211405-211441, the channel test at D:L211408: no
 * jitter buffer, research 170 §6.1), so the holder named was the voice heard. The page plays behind a jitter window and may play a talk after its
 * floor has gone (the owner's playtest of 2026-10-10/11: the sound late "with no tell of who said it"), so the voice
 * playing names the talker and the floor entry is the early hint -- the original's rule wherever the two agree.
 *
 * **A browser adaptation** (research 226 §6, the fix round): the original named the floor's holder frame by frame. This
 * departs from it twice, both only while a talk's tail is still playing behind the jitter window: the old talker's name
 * stays up after the floor is released, until his voice has played out; and a new holder's name waits until that tail
 * has played, so the line, the busy icon, the compass mark and the lobby's bar name whoever is heard.
 */
export function heardTalker(holder: number | null, playing: number | null | undefined, self: number | null): number | null {
  if (playing !== null && playing !== undefined && playing !== self) return playing;
  return holder !== null && holder !== self ? holder : null;
}

/**
 * VOICE_SUSPENDED_MARK_PLACEHOLDER (VOICE-LATE (A), research 226 §3.2): the line shown in the speaker's place -- the
 * round's element's name line, the lobby's bar -- while the voice playback's context, which ran, is found suspended at a
 * voice frame (a device change, a discarded tab): the frame is not played, and the page says so rather than drop it
 * silently. A browser adaptation: the original shows nothing here (its headset had no context to lose). The wording is
 * a stand-in for the owner's (a muted headset mark or the Legend's line, his choice); it is not the launcher's sound
 * gesture step, which is the disc-access lane's and its own words.
 */
export const VOICE_SUSPENDED_MARK_PLACEHOLDER = 'VOICE PAUSED';

/** The base the icon reads (`voice+0x2c`, before the side bit `FUN_0030fcd0` ORs in, D:L211584-211588): 0..7 -> `& 3`. */
export function voiceBase(channel: number | null): number | null {
  if (channel === null) return null;
  return channel >= 0 && channel <= 7 ? channel & 3 : channel;
}

/** The channel icon (`FUN_002393f0`): radio off's on 11, the base's on 0..3 and 10, none else (the lobby's 9, not told yet). */
export function channelIcon(channel: number | null): string | null {
  if (channel === VOICE_RADIO_OFF) return VOICE_NO_TALK_ICON;
  const base = voiceBase(channel);
  return base === null ? null : VOICE_CHANNEL_ICONS[base] ?? null;
}

/** The number's text (`FUN_00238ac0` D:L85707-85715): `"%d"` (S:0x3e6750) in 0..99, else `"?"` (S:0x3e6758). */
export function voiceCountText(n: number): string {
  return n < 0 || n > 99 ? '?' : String(n);
}

/**
 * The number beside the icon: `voice+0x5c`, the member count of the page's own voice channel, the page itself included
 * (research 227 §2.11, C92). The original's voice tick (`FUN_0030ec10` D:L211004) asks the network library for its
 * channel `voice+0x24` (`FUN_00623ae8`), whose answer (`FUN_006432c8` D:L556962-556990) copies the matching channel's
 * member count (`FUN_00644c90` D:L558061-558095) into `voice+0x54..0x5c` -- only on success: with no collection for the
 * channel it writes nothing, and the count stands. Set to 0 at the voice object's init (`FUN_00310080` D:L211754), and
 * drawn as it stands (`FUN_00238ac0` D:L85707-85715). So here: the room's word (`voiceMembers`, AD-14) when it names
 * the channel the page is on, else `last` -- 0 before the first word, and after a channel change the previous channel's
 * count until the new one's word (LATER 77: the page's own estimate from its rows, retired).
 */
export function voiceCount(channel: number | null, members: { channel: number; members: number } | null | undefined, last: number): number {
  return members && channel !== null && members.channel === channel ? members.members : last;
}

/**
 * The speaker's line (`FUN_00238ac0` D:L85680-85692): `"[%s] %s"` (S:0x3e6718) with a clan, the name alone without
 * (an empty tag, `FUN_00199288` D:L85686). The clan is the holder's slot's published tag (`FUN_002c3ac0` D:L85681, the
 * player state's +0x2e), the board's own source -- a watcher's too, his state built with no role test on the tag
 * (`FUN_002c5450` D:L166281-166293; research 275 §5): AD-13 reads it from the room's told tags (`seatClans`, the page's
 * `NetClient.clans`; `VoiceHudSources.clanOf`), then from the talker's score row (`ScoreRow.clan`, CLAN-TAG-ROUND,
 * research 275 §2.3). The game lobby's bar reads the same told tags (`@s2u/ui` `GameLobbyCommands.seatClans`).
 */
export function speakerText(name: string | null, clan = ''): string | null {
  if (name === null) return null;
  return clan ? `[${clan}] ${name}` : name;
}

/** What the element's tick reads: the room's floor entry and the page's own state. */
export interface VoiceElementInput {
  /** The page's channel (`voiceFloor.channel`), null before the room told one. */
  channel: number | null;
  /** The channel's floor holder (`voiceFloor.holder`), null when free. */
  holder: number | null;
  /** The page's member id. */
  self: number | null;
  /** The page's talk flag (the talk input's): with the floor its own, the voice object's recording state 3 (`FUN_0030e710`). */
  talking: boolean;
  /** The number beside the icon (`voiceCount`). */
  count: number;
  /** A member's name, or null when no slot names him. */
  nameOf(id: number): string | null;
  /** CLAN-TAG-ROUND, AD-13: a member's clan tag (the room's told tag, else his score row's; research 275 §2.3, §5); absent or '', none. */
  clanOf?(id: number): string;
  /** VOICE-LATE (B): the speaker whose voice the page is playing now (`VoiceState.playing`); absent or null, none. */
  playing?: number | null;
  /** VOICE-LATE (A): the suspended mark (`VoiceState.suspended`): the line says `VOICE_SUSPENDED_MARK_PLACEHOLDER`. */
  suspended?: boolean;
}

/** What the HUD draws: the channel icon, the number, the speaker's line and the talk / busy icon (null: hidden). */
export interface VoiceElementView { icon: string | null; count: string; name: string | null; talk: string | null }

/** The element's state across frames: the busy hold (`DAT_004145f0`) and the last line drawn. */
export class HudVoiceElement {
  private busyUntil = -Infinity;
  private name: string | null = null;
  private count = '0';
  /** `voice+0x5c` as it stands: 0 from the voice object's init (`FUN_00310080` D:L211754), the last count the room named (`voiceCount`). */
  members = 0;

  /** One frame at `now` seconds. */
  tick(now: number, i: VoiceElementInput): VoiceElementView {
    // `FUN_0030e790` (D:L210826-210840): the listener's channel's entry held, by another than this console -- or, VOICE-LATE
    // (B), another's voice playing on the page now (`heardTalker`: the floor entry the early hint).
    const talker = heardTalker(i.holder, i.playing, i.self);
    const another = talker !== null;
    // `FUN_00238ac0`: another's name, or " " (S:0x3e6748) and the line hidden; a holder no slot names returns early (D:L85683-85684:
    // the line and the number not rewritten this frame).
    const known = another ? i.nameOf(talker) : null;
    if (!another || known !== null) {
      this.name = another ? speakerText(known, i.clanOf?.(talker) ?? '') : null;
      this.count = voiceCountText(i.count);
    }
    // `FUN_00239250`: the hold set while another holds; recording first, else busy until the hold has passed.
    if (another) this.busyUntil = now + VOICE_BUSY_HOLD_SECONDS;
    const recording = i.talking && i.holder !== null && i.holder === i.self;
    const talk = recording ? VOICE_TALK_ICON : now <= this.busyUntil ? VOICE_BUSY_ICON : null;
    // VOICE-LATE (A): a context lost later is said in the line, never a silent drop (a browser adaptation).
    return { icon: channelIcon(i.channel), count: this.count, name: i.suspended ? VOICE_SUSPENDED_MARK_PLACEHOLDER : this.name, talk };
  }
}

/** A tag `FUN_002269a0` weighs: its actor against the page's, and its pen on the 640x448 frame. */
export interface TagCandidate {
  /**
   * A type-2 actor with a scene node (`FUN_0029ed20` = the actor's `+0x28`, D:L77357-77365; research 329 §1.2). (Was: "a
   * player record".)
   */
  record: boolean;
  /**
   * `FUN_00315580(node, 2)` nonzero (D:L77376): the node drawn this frame or the last (research 329 §1.2;
   * `./hudTags` `MP_TEAM_TAG_CULL_READING`). (Was: "unread".)
   */
  query: boolean;
  /** The record's `+0x5c` bit 0 (D:L77379). */
  bit5c: boolean;
  /** The page's own actor (D:L77377: `iVar4 != iVar9`). */
  self: boolean;
  /**
   * `FUN_00548050(actor)` (D:L77377): the seconds since the actor's death, 0 while alive (D:L413162-413174; research 329
   * §1.5); a tag needs it under 5.0 (an actor without the alive bit's tag at alpha 100 - 20 x it, D:L77428-77433). (Was:
   * "unread".) NU-9 (c): `./hudTags` `teamTags` and `./hud` `teamTagLayout` hold this rule for the drawn tags.
   */
  metric: number;
  /** The actor's team word shares a bit with the page's (D:L77378). */
  teamMask: boolean;
  /** The actor's flag 0x20000 (D:L77379). */
  flag20000: boolean;
  /** The tag's pen: its centre x less half its width (`fVar15`), its y (`fVar14`). */
  x: number; y: number;
  /** The tags' top margin (`param_1 + 0x5e0`). */
  top: number;
}

/** A tag that was drawn (D:L77357-77380, D:L77404-77405): a player's record, in range, a teammate, not flagged, its pen inside x 0..600, y top..448 - top. */
export function tagDrawn(t: TagCandidate): boolean {
  return t.record && t.query && t.bit5c && t.metric < 5.0 && !t.self && t.teamMask && !t.flag20000
    && t.x > 0 && t.x < 600 && t.y > t.top && t.y < 448 - t.top;
}

/** One sprite over a tag: its texture, the rectangle as `FUN_00364660` takes it (x0, y0, x1, y1), its colour and alpha. */
export interface TagSprite { texture: string; x0: number; y0: number; x1: number; y1: number; rgb: [number, number, number]; alpha: number }

/**
 * The talk icon and the arrow over a drawn tag (D:L77434-77443), on the holder's tag only (`iStack_f0`, set while another
 * holds, D:L77348-77350): the tag's centre x (`fVar15`), its y. The arrow (40, 96, 110) at alpha 64 (D:L77552-77553),
 * 32 wide (`DAT_0040dbd8` = 0.5 x `DAT_003dc870` 32, the initializer at 0x3fe940) from 10 above the tag (`DAT_003dc878`)
 * up 32 -- its y0 below its y1, drawn flipped; the icon (128, 128, 128) at alpha 64 (D:L77545-77546), 32 x 32
 * (`DAT_003dc868`), its bottom 7 into the arrow's top (`DAT_003dc880` -7).
 */
export function tagTalkSprites(tag: { id: number; x: number; y: number }, holder: number | null, self: number | null): TagSprite[] {
  if (holder === null || holder === self || tag.id !== holder) return [];
  const arrowY0 = tag.y - 10, arrowY1 = arrowY0 - 32, iconY1 = arrowY1 - -7;
  return [
    { texture: VOICE_TAG_ARROW, x0: tag.x - 16, y0: arrowY0, x1: tag.x + 16, y1: arrowY1, rgb: [40, 96, 110], alpha: 64 },
    { texture: VOICE_TALK_ICON, x0: tag.x - 16, y0: iconY1 - 32, x1: tag.x + 16, y1: iconY1, rgb: [128, 128, 128], alpha: 64 },
  ];
}

/**
 * The `hud_talk.tif` compass mark (`VOICE_TALK_MARK_READING`): at the holder's actor `at` (x, y, z) while another holds
 * and his body is known; none past 900 units from the page's `own` (x, y, z) in the ground plane, or when either is
 * unknown.
 */
export function talkMark(holder: number | null, self: number | null, at: readonly number[] | null, own: readonly number[] | null): CompassMark | null {
  if (holder === null || holder === self || !at || !own) return null;
  const d = Math.hypot(at[0]! - own[0]!, at[2]! - own[2]!);
  if (d > VOICE_TALK_MARK_READING.hideBeyond) return null;
  return { bitmap: VOICE_TALK_MARK_READING.bitmap, x: at[0]!, z: at[2]!, pulse: true };
}

/** What a page hands the HUD each frame (`voiceHudFrame`): the voice client's state, the roster, the bodies. */
export interface VoiceHudSources {
  voice: {
    channel: number | null; holder: number | null; talking: boolean; playing?: number | null; suspended?: boolean;
    /** AD-14: the room's word on the page's channel (`VoiceState.members`); absent or null before one. */
    members?: { channel: number; members: number } | null;
  };
  self: { id: number; team: Team | null } | null;
  /** The room's score rows; a row's `clan` is the speaker's line's tag where `clanOf` gives none (CLAN-TAG-ROUND, research 275 §2.3). */
  rows: readonly (Pick<ScoreRow, 'id' | 'team' | 'alive'> & { clan?: string })[];
  spectators: number;
  nameOf(id: number): string | null;
  /**
   * AD-13 (research 275 §5): a member's tag as the room told it (`seatClans`, the page's `NetClient.clans`) -- players'
   * and watchers' alike, so a tagged spectator's line reads "[tag] name" on the other spectators' screens; '' for none.
   * Absent (an older room, a page without the board): the rows' alone.
   */
  clanOf?(id: number): string;
  /** A member's body (x, y, z), or null; and the page's own. */
  at(id: number): readonly number[] | null;
  own: readonly number[] | null;
}

/**
 * The element's view and the talk mark for one frame -- what `Hud.setVoice` and `Hud.setTalkMarks` take (the pages'
 * frame loops, `./main` and `./matchMount`; note 227 §2.5).
 */
export function voiceHudFrame(el: HudVoiceElement, now: number, s: VoiceHudSources): { view: VoiceElementView; marks: CompassMark[] } {
  const self = s.self?.id ?? null;
  const count = el.members = voiceCount(s.voice.channel, s.voice.members, el.members);   // AD-14's word, else the count as it stood (LATER 77)
  const view = el.tick(now, {
    channel: s.voice.channel, holder: s.voice.holder, self, talking: s.voice.talking, count, nameOf: s.nameOf,
    clanOf: (id) => s.clanOf?.(id) || (s.rows.find((r) => r.id === id)?.clan ?? ''),   // AD-13: the told tag, then the row's
    playing: s.voice.playing ?? null, suspended: s.voice.suspended === true,
  });
  // VOICE-LATE (B): the mark at the talker heard (`heardTalker`), the floor's holder while none plays.
  const talker = heardTalker(s.voice.holder, s.voice.playing, self);
  const mark = talker === null ? null : talkMark(talker, self, s.at(talker), s.own);
  return { view, marks: mark ? [mark] : [] };
}
