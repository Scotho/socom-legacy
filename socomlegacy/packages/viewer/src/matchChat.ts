import type { Side } from '@s2u/scene';
import type { GameAudio } from './audio';
import { TACTICAL_COMMANDS, tacticalAllowed, type CommunicationChoice } from './communications';
import type { BannerLine, Hud } from './hud';
import type { PART_DEPS } from './matchNet';
import type { ServerEvent } from './net/protocol';
import type { NetPage, NetPageDeps } from './netPage';
import type { SoundData } from './soundData';
import { spectatorEntries, VoteAllToggle, voteRowsOpen } from './spectatorVote';
import type { TauntData } from './tauntData';
import { SPECTATORS_ROOT, type ChatEntry } from './tauntMenu';
import { tauntText } from './tauntSettings';
import { TAUNT_SLOTS } from './taunts';
import { botDisplayName, plainBotText } from './botPresentation';
import type { MatchVoice } from './voice/voiceClient';

/**
 * The Chat menu's TACTICAL ORDERS and MESSAGES (web research 302 §3; Chris's settings, 2026-10-07), written once for
 * both pages' matches -- `/testroom` (`./main`) and the front end's (`./matchMount`) -- beside the TAUNTS part
 * (`./matchTaunts`), whose menu (`./tauntMenu`) shows the rows this part gives it (`entries`). `FUN_002344e0` builds
 * the five roots; TACTICAL ORDERS holds the seven commands 6, 3, 23, 45, 46, 47, 48 (each row's label the sender's
 * character's multiplayer command record, `./tauntData` `tactical`), MESSAGES the five `MPLOCALSOP1..5`
 * (`./messageSettings`). A send goes to the room (`packages/match/src/room.ts`): the sender's team and its own echo
 * (`FUN_0022fc00`, 0022fc80..0022fca8), the recipients the server's; the room's communications are heard here
 * (`./matchNet` `PART_DEPS.chat`) -- the HUD's message line in colour 3 and a tactical command's recording through
 * the match's sound (`./matchSound`'s `GameAudio`, the group's weighted pick, a placed stream for another's).
 *
 * MATCH-05 (web sprint 20; research 170 §5.3, C1; note 227 §2): RADIO and TEAMMATES give the tree's rows once the page
 * hands the part its voice client (`voice`) -- RADIO > ACTIVE CHANNEL (TEAM, OFFENSE, DEFENSE) and RADIO ON:OFF, a
 * spectator's RADIO > RADIO ON:OFF alone; TEAMMATES > a teammate (the dead too) > VOTE RETAIN:REMOVE and MUTE ON:OFF,
 * the listener's own mute (nothing sent). No row carries a talk mark (`VOICE_ROW_MARK_READING`, C9) and no row plays a
 * sound of its own (the menu's `.TCM_` aside).
 *
 * SVC-23f (W18.R3; research 264 §4.3): SPECTATORS > VOTE ALL ON:OFF (`./spectatorVote`), a player's only, its rows only
 * while the room's `score` names a spectator (`Hud.spectatorCount`) -- otherwise the root is not drawn (`./tauntMenu`);
 * its press sends `voteAll` with the toggle's new state.
 *
 * Parked (OT.R8): without `voice`, RADIO gives no rows and MUTE is inactive; a tactical command its mode refuses (DEFUSE outside game types 1-2, PROTECT outside
 * 3-4: `FUN_0022fa90`, the jump table 0x3e5d30) or whose recording the disc lacks, and an empty message, do nothing.
 * Nothing here imports `./main` or reads page markup (OT.R12).
 */

/** The part's `NetPage` hooks, as `PART_DEPS.chat` lists them. */
export type MatchChatNetDeps = Required<Pick<NetPageDeps, (typeof PART_DEPS)['chat'][number]>>;

/** A communication the page heard (the browser spec's hook, `state`). */
export interface HeardCommunication { sender: number; request: number; text: string; sound: string | null; result: string }

/** What the part reads. */
export interface MatchChatDeps {
  net(): NetPage | null;
  hud: Pick<Hud, 'postMessage'> & Partial<Pick<Hud, 'spectatorCount'>>;
  /** The match's audio (`./matchSound` `MatchSound.audio`): a tactical command's recording. */
  audio: Pick<GameAudio, 'playStream' | 'hasStream'>;
  /** The five as the page holds them (the card's, else the defaults `dlgNetLogin` set); null for one not held. */
  messages(): readonly (string | null)[];
  /** The page's side (`./matchCore` `matchSide`) and its character there (`PlayerLoadout.type`): the rows' labels. */
  side(): Side;
  character(side: Side): number;
  /**
   * MATCH-05: the page's voice client (`./voice/voiceClient` `mountVoice`): RADIO's asks go through it and TEAMMATES'
   * mute is its; absent or null, RADIO and TEAMMATES stay parked.
   */
  voice?(): Pick<MatchVoice, 'state' | 'radio' | 'mute' | 'muted'> | null;
}

/** The browser spec's view of the part. */
export interface ChatState { messages: string[]; received: HeardCommunication[] }

export interface MatchChat {
  /**
   * The rows of a root the Chat menu opens (`TauntMenuDeps.entries`): TACTICAL ORDERS (0) and MESSAGES (4); MATCH-05's
   * RADIO (2) with a voice client and TEAMMATES (3); SVC-23f's SPECTATORS (5) while a spectator is present; a spectator's
   * RADIO alone.
   */
  entries(root: number): ChatEntry[];
  /** The map's sound data (`./soundData`'s `taunts`: the tactical records, the messages' defaults, the captions). */
  setData(data: SoundData | null): void;
  /** The five as the menu shows and sends them: the page's, a HudCLOC key resolved, else the disc's defaults. */
  messages(): string[];
  /** The room's communications heard (`PART_DEPS.chat`). */
  netDeps(): MatchChatNetDeps;
  state(): ChatState;
  /** Everything let go: the map's data, the heard list and the VOTE ALL toggle. */
  dispose(): void;
}

/** TACTICAL ORDERS' help lines, literals of the game's ELF (0x3e5f40..0x3e6070), in `TACTICAL_COMMANDS`' order. */
export const TACTICAL_HELP: readonly string[] = [
  'Tactical: Hold your fire', 'Tactical: Fire at will', 'Tactical: Clear the area of hostiles', 'Tactical: Cover me',
  'Tactical: Defuse the bomb', 'Tactical: Protect target', "Tactical: I'll take point",
];

/** MESSAGES' help lines, literals of the game's ELF (0x3e6490..0x3e6550). */
export const MESSAGE_HELP: readonly string[] = [1, 2, 3, 4, 5].map((n) => `Custom Team Message ${n}`);

/**
 * RADIO's rows as `FUN_00232bc0` builds the tree (D:L83601-83606) and `FUN_002344e0` binds them (D:L83787-83792): the
 * labels and help lines are the ELF's (S:0x3e6180..0x3e6220; OFFENSE's help keeps its trailing space); TEAM asks 0,
 * OFFENSE 2, DEFENSE 1 (C1).
 */
export const RADIO_CHANNEL_ROWS: readonly { label: string; help: string; active: 0 | 1 | 2 }[] = [
  { label: 'TEAM', help: 'Set radio channel to TEAM', active: 0 },
  { label: 'OFFENSE', help: 'Set radio channel to OFFENSE ', active: 2 },
  { label: 'DEFENSE', help: 'Set radio channel to DEFENSE', active: 1 },
];

/**
 * TEAMMATE_ROW_ORDER_READING: TEAMMATES' rows PLAYER 1..8 (D:L83608-83615) name the n-th actor of the side's in the
 * game's actor list (`FUN_0022f6e0` D:L81475-81508, `FUN_0022f5b0` D:L81444-81472); that list's order is not read
 * (research 302 §3's open dependency), so the page lists its teammates by member id, as its vote list does
 * (`./netPage` `teammates`).
 */
export const TEAMMATE_ROW_ORDER_READING = 'member id';
/** The tree's eight PLAYER nodes (D:L83608-83615). */
const TEAMMATE_ROWS = 8;

/**
 * A multiplayer command's line as `FUN_005e7960` posts it (D:L498217-498230): `FUN_002b6530` into the main message
 * window 0x4366a0 in colour 3 for a command under 0x36 -- HUD colour 3 (64,128,64,100): the table at 0x440ca0 read by
 * `FUN_002b7530` (research 302 §3) -- at the window's own scale. A tactical command's (`communication`) and, since NU-7
 * W1, a teammate's grenade warning (`./matchSound`, research 325 §2.1).
 */
export function commandLine(text: string): BannerLine {
  return { text, scale: 0.9, rgb: [0.5, 1, 0.5], opacity: 100 / 128 };
}

/** A command row's text formatted with the speaker's name (`FUN_001988d0`, D:L498142): its `%s` the name. */
export function commandText(text: string, name: string): string {
  return text.replace(/%s/g, () => name);
}

/** How many heard communications the dedup remembers (a sender's request once). */
const HEARD_KEPT = 100;

export function mountChat(d: MatchChatDeps): MatchChat {
  let data: TauntData | null = null;
  let request = 0;
  const heard: HeardCommunication[] = [];
  const voteAll = new VoteAllToggle();
  // OBF-20 (the review's F1): on from the resume's last request (`NetClient.requestFloor`), never under it.
  const send = (choice: CommunicationChoice): void => {
    const c = d.net()?.client;
    request = Math.max(request, c?.requestFloor?.('communication') ?? 0) + 1;
    c?.send({ type: 'communication', ...choice, request });
  };
  const messages = (): string[] => {
    const own = d.messages();
    return Array.from({ length: TAUNT_SLOTS }, (_, i) => tauntText(own[i] ?? null, data?.captions ?? {}, data?.messages?.[i] ?? ''));
  };
  const tactical = (): ChatEntry[] => {
    const side = d.side(), records = data?.tactical?.[side]?.[d.character(side)] ?? [];
    const gameType = d.net()?.gameType() ?? undefined;
    return TACTICAL_COMMANDS.map((command, i) => {
      const record = records[i] ?? null;
      const entry: ChatEntry = { label: record?.label ?? '', help: TACTICAL_HELP[i]!, key: `tactical:${command}` };
      // Refused by the mode, or no record or recording on the disc: the row does nothing (no sound, no send).
      if (!tacticalAllowed(command, gameType)) return { ...entry, unsupported: 'TACTICAL ORDER: NOT IN THIS GAME TYPE' };
      if (!record || !d.audio.hasStream(record.sound)) return { ...entry, unsupported: 'TACTICAL ORDER: RECORDING NOT ON THE DISC' };
      return { ...entry, action: () => { send({ kind: 'tactical', command }); } };
    });
  };
  const custom = (): ChatEntry[] => messages().map((text, slot) => ({
    label: text, help: MESSAGE_HELP[slot]!, key: `message:${slot}`,
    ...(text ? { action: () => { send({ kind: 'custom', slot, text }); } } : { unsupported: 'MESSAGE: EMPTY' }),
  }));
  /** The room's communication: once a sender's request; its text on the message line, a tactical recording at the sender. */
  const communication = (ev: Extract<ServerEvent, { type: 'communication' }>): void => {
    if (heard.some((t) => t.sender === ev.sender && t.request === ev.request)) return;
    const i = ev.command === null ? -1 : TACTICAL_COMMANDS.indexOf(ev.command as (typeof TACTICAL_COMMANDS)[number]);
    const vocal = i < 0 ? null : data?.tactical?.[ev.team]?.[ev.char]?.[i] ?? null;
    const name = botDisplayName(ev.name, d.net()?.isBot?.(ev.sender) === true);
    const text = ev.text !== null ? `${name} : ${plainBotText(ev.text)}` : (vocal ? commandText(vocal.text, name) : null) ?? `${name}: ORIGINAL COMMAND RECORD UNRESOLVED`;
    // The sender's own echo unplaced, another's at its body, as the taunts' (research 301 §4).
    const own = ev.sender === d.net()?.client.id;
    const result = vocal ? d.audio.playStream(vocal.sound, own ? null : ev.at) : ev.command === null ? 'text' : 'unsupported';
    // HUD colour 3 (64,128,64,100): the table at 0x440ca0 read by `FUN_002b7530` (research 302 §3; `commandLine`).
    d.hud.postMessage([commandLine(text)]);
    heard.push({ sender: ev.sender, request: ev.request, text: plainBotText(text), sound: vocal?.sound ?? null, result });
    if (heard.length > HEARD_KEPT) heard.shift();
  };
  /**
   * RADIO (root 2): ACTIVE CHANNEL's three, then RADIO ON:OFF -- labelled RADIO OFF while the radio is on and RADIO ON
   * while it is off (`FUN_0022f8f0` D:L81558-81571: the channel not 11, `FUN_0030e540`), and turning it the other way
   * (`FUN_0022f880`); a spectator's tree holds RADIO ON:OFF alone (D:L83641-83645).
   */
  const radio = (voice: NonNullable<ReturnType<NonNullable<MatchChatDeps['voice']>>>, spectator: boolean): ChatEntry[] => {
    const on = voice.state().channel !== 11;
    const onOff: ChatEntry = { label: on ? 'RADIO OFF' : 'RADIO ON', help: 'Radio (On, Off)', key: 'radio:onoff', action: () => { voice.radio({ on: !on }); } };
    if (spectator) return [onOff];
    const channels: ChatEntry = {
      label: 'ACTIVE CHANNEL', help: 'Set the active radio channel',
      children: RADIO_CHANNEL_ROWS.map((r) => ({ label: r.label, help: r.help, key: `radio:active:${r.active}`, action: () => { voice.radio({ active: r.active }); } })),
    };
    return [channels, onOff];
  };
  /**
   * TEAMMATES (root 3): a row per teammate of the page's side, the dead among them (`FUN_0022f5b0` D:L81444-81472: a
   * type-2 actor, not the page, sharing the team word, its 0x20000 bit clear -- the escortee's, research 190 -- and
   * `FUN_002c2fd0` 0, the spectator test (the team record's 0x10000, D:L164609-164643): no life test; the review's F1),
   * the room's rows being its seated players, so no spectator and no escortee among them; up to eight, labelled with his name (`FUN_0022f6e0`: the actor's `+0x14`), help
   * "Player n"; under each, VOTE REMOVE / VOTE RETAIN (`FUN_0022f440` D:L81375-81396, research 179 section 6) and MUTE
   * ON:OFF -- MUTE ON while he is muted, MUTE OFF while not (`FUN_0022f530`), toggled by `FUN_0022f4c0` (D:L81402-81414):
   * the listener's own mute, nothing sent (research 170 §5.3, D:L211411-211415). R4B-08 (r0004): the VOTE row only while
   * the camera views the own body (`VOTE_ROWS_CAMERA_GATE_READING`, r4 0x2d1710); else PLAYER n holds MUTE alone.
   */
  const teammates = (voice: ReturnType<NonNullable<MatchChatDeps['voice']>>): ChatEntry[] => {
    const net = d.net();
    if (!net) return [];
    const client = net.client, self = client.id, team = client.team, voting = voteRowsOpen(net.gate());
    return net.rows.filter((r) => r.team === team && r.id !== self).sort((a, b) => a.id - b.id).slice(0, TEAMMATE_ROWS)
      .map((r, i) => {
        const muted = voice?.muted(r.id) ?? false;
        return {
          label: botDisplayName(r.name, net.isBot?.(r.id) ?? r.bot === true), help: `Player ${i + 1}`,
          children: [
            ...(voting ? [{ label: net.votingToRemove(r.id) ? 'VOTE RETAIN' : 'VOTE REMOVE', help: 'Vote to Retain or Remove the selected player', key: `vote:${r.id}`,
              action: () => { if (d.net() === net && net.client === client) net.toggleVote(r.id); } }] : []),
            { label: muted ? 'MUTE ON' : 'MUTE OFF', help: 'Mute (On, Off)', key: `mute:${r.id}`,
              ...(voice ? { action: () => { voice.mute(r.id, !muted); } } : { unsupported: 'MUTE ON:OFF' }) },
          ],
        };
      });
  };
  /**
   * SPECTATORS (root 5, SVC-23f): VOTE ALL while the room's score names a spectator; the toggle the page's net client's.
   * R4B-08 (r0004): none while the camera views a teammate (`VOTE_ROWS_CAMERA_GATE_READING`, r4 0x2d15c0), the root with it.
   */
  const spectators = (): ChatEntry[] => {
    const net = d.net();
    if (!net || !voteRowsOpen(net.gate())) return [];
    return spectatorEntries({ spectators: d.hud.spectatorCount?.() ?? 0, client: net.client, toggle: voteAll, send: (e) => { net.client.send(e); } });
  };
  /** A spectator's tree holds RADIO alone (D:L83641-83645); voting needs no voice client or microphone. */
  const entries = (root: number): ChatEntry[] => {
    const voice = d.voice?.() ?? null, spectator = d.net()?.gate().spectator ?? false;
    if (spectator) return root === 2 && voice ? radio(voice, true) : [];
    if (root === 2) return voice ? radio(voice, false) : [];
    if (root === 3) return teammates(voice);
    if (root === SPECTATORS_ROOT) return spectators();
    return root === 0 ? tactical() : root === 4 ? custom() : [];
  };
  return {
    entries,
    setData: (s) => { data = s?.taunts ?? null; },
    messages,
    netDeps: () => ({ communication }),
    state: () => ({ messages: messages(), received: [...heard] }),
    dispose: () => { data = null; heard.length = 0; voteAll.reset(); },
  };
}
