import { TALKER_BAR_FREE } from '@s2u/ui';
import { tunersOfVars } from '../../audio';
import type { PadButton } from '../../gamepad';
import { heardTalker, VOICE_SUSPENDED_MARK_PLACEHOLDER } from '../../hudVoice';
import type { NetClient } from '../../net/client';
import type { ServerEvent } from '../../net/protocol';
import { mountHeadset, type Headset } from '../../voice/headset';
import { TalkInput } from '../../voice/talkInput';
import { mountVoice, type MatchVoice, type MatchVoiceDeps, type VoiceState } from '../../voice/voiceClient';

/**
 * FORGE (FG-27; FG.R22): the lobby popup's voice -- a browser adaptation with no original of its own: the room's lobby
 * channel (the voice path of web sprint 20) through `mountVoice` (`../../voice/voiceClient`) over the forge lobby's
 * `NetClient`, wired as `../../gameLobbyHost` `GameLobbyVoice` wires the game lobby's (its pattern, not its class, which
 * is bound to the front end's valves and uiVars). Nothing of the voice's behaviour is changed here; this module only
 * feeds the existing parts:
 *
 * - **the talk**: Circle in the talk input's lobby phase (`../../voice/talkInput`: press talks, release stops, the 10 s
 *   cut and its wait, `VOICE_TALK_CAP_READING` / `VOICE_PAGE_RECORD_CAP_READING`), held by any of three sources -- the
 *   window's hold-to-talk button (the pointer), the pad's Circle (the page calls `talk('pad', down)`), and the headset's
 *   DEV key (`../../voice/headset` `keys('lobby')`, attached there only under `import.meta.env.DEV`, the `s2u-kb-voice`
 *   site: no key listener is added here), the key not read while the chat's input is typed into nor over the ARMORY;
 *   its flag to the voice client's `pad`, once a frame;
 * - **the floor**: the room's `voiceFloor` -- the listener's channel's entry -- kept for the talker bar (`holder`, with
 *   VOICE-LATE's `heardTalker`) and passed to the voice client with the room's voice frames (`NetClient.on`/`onVoice`);
 * - **the ARMORY**: its entry clears the talk (`FUN_0027d8c0` D:L126098) and sends RADIO OFF, its return RADIO ON
 *   (`voiceRadio`, once each, on the client it went on: `GameLobbyVoice.armoryToRoom`, the close review's F2);
 * - **the headset's lines** (the notice before the first microphone ask, no headset): to the popup's chat panel, as
 *   `LOBBY_VOICE_LINE_ADAPTATION` puts them in the game lobby's.
 *
 * The pad's Home button (button 16) is never read here or anywhere in the popup (the owner's word, 2026-10-14, FG.R22).
 */

/** What the voice reads of the lobby's client. */
export type ForgeVoiceLink = Pick<NetClient, 'id' | 'send' | 'sendVoice' | 'state' | 'on' | 'onVoice'>;

/** The voice client's options (`mountVoice`'s, its link the lobby's client), and the seams a test fills. */
export type ForgeLobbyVoiceDeps = Partial<Omit<MatchVoiceDeps, 'net' | 'headset'>> & {
  /** The talk input's clock, seconds; absent, `performance.now() / 1000`. */
  seconds?(): number;
  /** The headset UX on its line; absent, `mountHeadset` on the page's window and pads. */
  headset?(line: (text: string) => void): Headset;
  /** The voice client's mount; absent, `mountVoice`. */
  mount?(d: MatchVoiceDeps): MatchVoice;
};

export interface ForgeLobbyVoiceOptions {
  /** The lobby's client, or null (not seated yet, or let go). */
  link(): ForgeVoiceLink | null;
  /** A headset line, to the chat panel. */
  line(text: string): void;
  /** Whether the chat's input has the focus (the DEV key is a letter typed there). */
  typing(): boolean;
  /** Whether the ARMORY is up in the window. */
  inArmory(): boolean;
  deps?: ForgeLobbyVoiceDeps;
}

export type TalkSource = 'pointer' | 'pad';

const NO_BUTTONS: ReadonlySet<PadButton> = new Set();
const CIRCLE_HELD: ReadonlySet<PadButton> = new Set<PadButton>(['Circle']);

export class ForgeLobbyVoice {
  /** The talk input; its Chat menu is never opened in the lobby phase, so its hooks are inert. */
  private readonly input = new TalkInput({ send: () => undefined, custom: () => [], sound: () => undefined, unsupported: () => undefined, entries: () => [] });
  private voice: MatchVoice | null = null;
  private headset: Headset | null = null;
  private readonly held = new Set<TalkSource>();
  private flag = false;
  /** The client listened to, and its listeners' removal. */
  private heard: ForgeVoiceLink | null = null;
  private off: (() => void)[] = [];
  /** The listener's channel's entry: its holder, null when free; and the client it was told on. */
  private floor: number | null = null;
  private floorOf: ForgeVoiceLink | null = null;
  /** The client the ARMORY's RADIO OFF went on (its return owed there), or null. */
  private armoryOf: ForgeVoiceLink | null = null;
  private wasArmory = false;

  constructor(private readonly o: ForgeLobbyVoiceOptions) {}

  private deps(): ForgeLobbyVoiceDeps { return this.o.deps ?? {}; }
  private seconds(): number { return this.deps().seconds?.() ?? performance.now() / 1000; }
  private entry(): number | null { return this.floorOf !== null && this.floorOf === this.o.link() ? this.floor : null; }

  /** Circle held (true) or let go (false) by `source`. */
  talk(source: TalkSource, down: boolean): void {
    if (down) this.held.add(source); else this.held.delete(source);
  }

  /** Whether the seat talks now (the talk flag set while the floor names it: the original's state 3). */
  recording(): boolean { const c = this.o.link(); return this.flag && c !== null && this.entry() === c.id; }

  /** The bar's talker: the speaker the client plays now, else the floor's holder (`GameLobbyVoice.holder`). */
  holder(): number | null {
    const entry = this.entry(), playing = this.voice?.state().playing ?? null;
    if (playing === null) return entry;
    return heardTalker(entry, playing, this.o.link()?.id ?? null) ?? entry;
  }

  /**
   * The talker bar's text, as `GameLobbyCommands.voiceBar` writes it: the suspended mark while voice cannot play
   * (`VOICE_SUSPENDED_MARK_PLACEHOLDER`), another's name while he holds the floor, else `TALKER_BAR_FREE`.
   */
  bar(name: (id: number) => string | null): string {
    if (this.voice?.state().suspended) return VOICE_SUSPENDED_MARK_PLACEHOLDER;
    const h = this.holder();
    if (h === null || h === (this.o.link()?.id ?? null)) return TALKER_BAR_FREE;
    return name(h) ?? TALKER_BAR_FREE;
  }

  /** The voice client's state, or null before it is mounted and after it is let go. */
  state(): VoiceState | null { return this.voice?.state() ?? null; }

  private listen(link: ForgeVoiceLink): void {
    this.unlisten();
    this.heard = link;
    this.off.push(link.on((ev: ServerEvent) => {
      if (ev.type !== 'voiceFloor') return;
      this.floor = ev.holder; this.floorOf = link;
      this.voice?.netDeps().voiceFloor(ev);
    }));
    this.off.push(link.onVoice((down) => { this.voice?.netDeps().voiceFrame(down); }));
  }

  private unlisten(): void {
    for (const f of this.off.splice(0)) f();
    this.heard = null;
  }

  /** Once a frame: the client listened to, the voice mounted on it, the talk input's lobby phase, its flag on. */
  frame(): void {
    const link = this.o.link();
    if (link === null) { if (this.heard !== null || this.voice !== null) this.release(); return; }
    if (this.heard !== link) this.listen(link);
    const { headset: makeHeadset, mount, seconds: _s, ...d } = this.deps();
    const headset = this.headset ??= (makeHeadset ?? ((line: (text: string) => void) => mountHeadset({ line })))((text) => { this.o.line(text); });
    this.voice ??= (mount ?? mountVoice)({
      ...d, net: () => { const l = this.o.link(); return l ? { client: l } : null; }, tuners: d.tuners ?? (() => tunersOfVars(null)), headset,
    });
    const inArmory = this.o.inArmory();
    // The ARMORY's entry clears the talk (D:L126098): a source held into it is let go.
    if (inArmory && !this.wasArmory) this.held.clear();
    this.wasArmory = inArmory;
    const h = headset.frame({ phase: 'lobby', spectator: false });
    const key = !inArmory && !this.o.typing() && headset.keys('lobby').size > 0;
    const circle = !inArmory && (this.held.size > 0 || key);
    const f = this.input.frame(this.seconds(), circle ? CIRCLE_HELD : NO_BUTTONS, {
      phase: 'lobby', preset: 'Default', runAndTalk: false, menuAllowed: false, talkAllowed: true,
      lateJoiner: false, padPresent: h.padPresent, focused: h.focused,
    });
    this.flag = f.talk;
    this.voice.pad(f.talk);
    this.armoryToRoom(link, inArmory);
  }

  /** RADIO OFF at the ARMORY's entry and ON at its return, each once, on an open client (`GameLobbyVoice.armoryToRoom`). */
  private armoryToRoom(link: ForgeVoiceLink, inArmory: boolean): void {
    if (link.state !== 'open') return;
    if (inArmory && this.armoryOf !== link) {
      link.send({ type: 'voiceRadio', on: false });
      this.armoryOf = link;
    } else if (!inArmory && this.armoryOf !== null) {
      if (this.armoryOf === link) link.send({ type: 'voiceRadio', on: true });
      this.armoryOf = null;
    }
  }

  /** The voice client and the headset let go, the client no longer listened to. */
  release(): void {
    this.unlisten();
    this.voice?.dispose();
    this.voice = null;
    this.headset?.dispose();
    this.headset = null;
    this.held.clear();
    this.flag = false; this.floor = null; this.floorOf = null; this.armoryOf = null; this.wasArmory = false;
  }
}
