import type { Side } from '@s2u/scene';
import type { GameAudio } from '../audio';
import type { Input, PadButton } from '../gamepad';
import type { HudQuad, HudTri } from '../hudLayout';
import { HudVoiceElement, voiceHudFrame } from '../hudVoice';
import { mountChat } from '../matchChat';
import { mountTaunts, type MatchTauntsDeps } from '../matchTaunts';
import type { NetClient } from '../net/client';
import type { ScoreRow, ServerEvent, Team } from '../net/protocol';
import type { NetPage } from '../netPage';
import type { SoundData } from '../soundData';
import { gameMicrophoneOn } from '../gameMicrophone';
import { mountVoice, type MatchVoice } from '../voice/voiceClient';
import type { PrototypeHud } from './sceneFrame';

/**
 * The lightweight match's talk (a browser adaptation's mounting; the parts are the production modules): the Chat menu
 * with TAUNTS, TACTICAL ORDERS and MESSAGES (`../matchTaunts`, `../matchChat`), the taunts and communications heard,
 * and the voice chat on the game's own socket (`../voice/voiceClient`: hold the talk button, the microphone asked for
 * at the first press) with its HUD element and talk marks (`../hudVoice`).
 *
 * The parts ask a `NetPage` for a few of its reads (the client, the gate, the score rows); this stands a small object in
 * for it over the runtime's own client -- no `NetPage` is made. The votes to remove a player are not carried (their
 * rows read as never voted and a toggle does nothing), and the keyboard's text line is not mounted.
 */
export function walkingTalk(d: {
  hud: PrototypeHud; client(): NetClient | null; audio(): GameAudio | null;
  rows(): readonly ScoreRow[]; spectators(): number; alive(): boolean; screenUp(): boolean;
  side(): Side; character(side: Side): number;
  custom(): readonly (string | null)[]; messages(): readonly (string | null)[];
  talk?: MatchTauntsDeps['talk'];
  otherMenu(): boolean; release(): void; runAndTalk(): boolean; aborting(): boolean;
  feetOf(id: number): readonly number[] | null; ownFeet(): readonly number[] | null;
  /** An instrument's switches: the voice client or the voice HUD left out, for a before-and-after measure. */
  without?: { voice?: boolean; hud?: boolean; permissionAsk?: boolean };
}) {
  const nameOf = (id: number): string | null => d.rows().find(row => row.id === id)?.name ?? null;
  const isBot = (id: number): boolean => (d.rows().find(row => row.id === id) as { bot?: boolean } | undefined)?.bot === true;
  // One object for the parts' identity checks (`d.net() === net && net.client === client`): its reads follow the client.
  const page = {
    get client() { return d.client()!; },
    gate: () => { const client = d.client(), player = client?.role === 'player';
      return { inMatch: client?.state === 'open', alive: player && d.alive(), cameraOnSelf: true, spectator: !player }; },
    isBot, screenUp: () => d.screenUp(), get rows() { return d.rows() as ScoreRow[]; }, gameType: () => null,
    votingToRemove: () => false, toggleVote: () => {}, displayNameOf: (id: number) => nameOf(id) ?? '',
  } as unknown as NetPage;
  const net = (): NetPage | null => (d.client() ? page : null);
  // The match's audio comes after the mount on the experiment page: asked for at each call.
  const audio = {
    play: (...a: Parameters<GameAudio['play']>) => d.audio()?.play(...a),
    playStream: (...a: Parameters<GameAudio['playStream']>) => d.audio()?.playStream(...a),
    hasStream: (...a: Parameters<GameAudio['hasStream']>) => d.audio()?.hasStream(...a) ?? false,
  } as unknown as Pick<GameAudio, 'play' | 'playStream' | 'hasStream'>;
  const hud = d.hud as unknown as Parameters<typeof mountChat>[0]['hud'] & Parameters<typeof mountTaunts>[0]['hud'];
  let voice: ReturnType<typeof mountVoice> | null = null;
  // The setup page's "use in game" switch is a stored setting: read once a second, not at every ask -- the voice's
  // state is asked several times a frame (the HUD, the Chat menu's rows), and a storage read is a slow synchronous
  // call on the console (the whole frame ran about 30% longer with the voice mounted, Developer Mode, 2026-11-19).
  let micOn = true, micAskedAt = -Infinity;
  const microphoneOn = (): boolean => { const now = performance.now(); if (now - micAskedAt > 1000) { micAskedAt = now; micOn = gameMicrophoneOn(); } return micOn; };
  // The voice's state once a frame for every asker (`frame` moves the stamp).
  let stamp = 0, stateAt = -1, stateNow: ReturnType<MatchVoice['state']> | null = null;
  const voiceState = (): ReturnType<MatchVoice['state']> => { if (stateAt !== stamp || !stateNow) { stateAt = stamp; stateNow = voice!.state(); } return stateNow; };
  const voiceForChat = { state: voiceState, radio: (ask: Parameters<MatchVoice['radio']>[0]) => voice?.radio(ask), mute: (id: number, on: boolean) => voice?.mute(id, on), muted: (id: number) => voice?.muted(id) ?? false };
  const chat = mountChat({ net, hud, audio, messages: d.messages, side: d.side, character: d.character, voice: () => voice ? voiceForChat : null });
  const taunts = mountTaunts({
    net, hud, audio, custom: d.custom, otherMenu: d.otherMenu, release: d.release, entries: root => chat.entries(root),
    runAndTalk: d.runAndTalk, aborting: d.aborting, ...(d.talk ? { talk: d.talk } : {}),
  });
  voice = d.without?.voice ? null : mountVoice({
    net: () => { const client = d.client(); return client ? { client } : null; },
    tuners: () => d.audio()?.getTuners() ?? { headset: 1 },
    headset: taunts.headset, microphoneOn,
    ...(d.without?.permissionAsk ? { permission: async () => null } : {}),
  });
  const element = new HudVoiceElement();
  let voiceFrames = 0;
  let heard: (() => void) | null = null, bound: NetClient | null = null, data: SoundData | null = null, disposed = false;
  const bind = (): void => {
    const client = d.client();
    if (client === bound) return;
    heard?.(); heard = null; bound = client;
    if (client) heard = client.onVoice(down => { voiceFrames++; voice?.netDeps().voiceFrame?.(down); });
  };
  return {
    isOpen: () => taunts.isOpen(), walking: () => taunts.walking(), setVoiceMask: (on: boolean) => { taunts.headset.setVoiceMask(on); },
    reset: () => { taunts.reset(); },
    /** The map's sound data (the vocals, the defaults, the captions): told once it is in, and again when it changes. */
    setData(next: SoundData | null): void { if (disposed || next === data) return; data = next; taunts.setData(next); chat.setData(next); },
    event(event: ServerEvent): void {
      if (disposed) return;
      if (event.type === 'taunt') taunts.netDeps().taunt?.(event);
      else if (event.type === 'communication') chat.netDeps().communication?.(event);
      else if (event.type === 'voiceFloor') voice?.netDeps().voiceFloor?.(event);
    },
    /** The pad's frame for the Chat menu and the talk button, between the START menu and the R2 inventory (`./walkingMenus` `pad`). */
    pad(held: ReadonlySet<PadButton>, input: Input, active: boolean): { owns: boolean; input: Input; walk?: boolean } {
      if (disposed) return { owns: false, input };
      bind(); stamp++;
      const taken = taunts.pad(held, input);
      voice?.pad(active && taken.talk);
      return { owns: taken.owns, input: taken.input, walk: taken.walk };   // XBOX-ARMORY review F1: OT.R130's walk under the menu
    },
    draw(frame: { width: number; height: number }, sizes: Record<string, { width: number; height: number }>): { quads: HudQuad[]; tris: HudTri[] } {
      return disposed ? { quads: [], tris: [] } : taunts.draw(frame, sizes);
    },
    /** The voice element and the talk marks for this frame (`../matchMount`'s MATCH-05 block), and the Chat menu's hide of the tags' texts. */
    frame(now: number): void {
      if (disposed || !voice || d.without?.hud) return;
      const client = d.client();
      const made = client ? voiceHudFrame(element, now / 1000, {
        voice: voiceState(), self: { id: client.id, team: client.role === 'player' ? client.team as Team : null },
        rows: d.rows(), spectators: d.spectators(), nameOf, clanOf: id => client.clans.of(id), at: d.feetOf, own: d.ownFeet(),
      }) : null;
      d.hud.setVoice(made?.view ?? null); d.hud.setTalkMarks(made?.marks ?? []);
      d.hud.setCommandMenu(taunts.isOpen());
    },
    /** An instrument's switch: the voice client let go mid-match (a before-and-after measure in one match). */
    dropVoice(): void { if (!voice) return; voice.pad(false); voice.dispose(); voice = null; d.hud.setVoice(null); d.hud.setTalkMarks([]); },
    report() { const s = voice ? voiceState() : null; return { menu: taunts.isOpen(), voice: s ? { channel: s.channel, holder: s.holder, talking: s.talking, heard: s.heard, sent: s.sent, playing: s.playing ?? null, suspended: s.suspended === true, throttled: s.throttled === true, headset: s.headset } : null, voiceFrames, heard: taunts.state().received.length }; },
    dispose(): void {
      if (disposed) return; disposed = true;
      heard?.(); heard = null; voice?.pad(false); voice?.dispose(); voice = null; taunts.dispose(); chat.dispose();
      d.hud.setVoice(null); d.hud.setTalkMarks([]); d.hud.setCommandMenu(false);
    },
  };
}
export type WalkingTalk = ReturnType<typeof walkingTalk>;
