import type { GameAudio } from './audio';
import { ExchangeInput } from './exchangeInput';
import type { Input, PadButton } from './gamepad';
import type { Hud, HudQuad, HudTri } from './hud';
import type { PART_DEPS } from './matchNet';
import type { ServerEvent } from './net/protocol';
import type { NetPage, NetPageDeps } from './netPage';
import type { SoundData } from './soundData';
import type { TauntData } from './tauntData';
import { drawTaunts } from './tauntLayout';
import type { ChatColumn, ChatEntry, TauntMenu } from './tauntMenu';
import { tauntText } from './tauntSettings';
import { TAUNT_SLOTS } from './taunts';
import { botDisplayName, plainBotText } from './botPresentation';
import { mountHeadset, type Headset } from './voice/headset';
import { TalkInput, VOICE_ROUND_TALK_BUTTON_READING } from './voice/talkInput';
import { controllerConfigs } from './controllerConfigs';

/**
 * TAUNTS (web research 301): the Chat menu's TAUNTS -- tap Circle (TeamCommand, `FUN_002344e0`), TAUNTS, then CHARACTER
 * TAUNT (`0x3b + rand%7`) or CUSTOM TAUNT 01-05 (`0x36..0x3a`) -- written once for both pages' matches: `/testroom`
 * (`./main`) and the front end's (`./matchMount`, the original's place: ONLINE, a game). The part owns the menu
 * (`./tauntMenu`), its draw on the HUD's overlay (`./tauntLayout`), the send (`NetPage`'s client, the room routes it:
 * the enemy team and the sender's echo, `packages/match/src/room.ts`), the room's taunts heard (`./matchNet`
 * `PART_DEPS.taunts`: `netDeps`) -- the HUD's message line in colour 5 and the character's recorded vocal through the
 * match's sound (`./matchSound`'s `GameAudio`, a placed stream for another's) -- and the pad while the menu is open.
 * The five texts are the page's (`custom`): the card's `MPTAUNTMSG1..5` (`./tauntSettings`). Nothing here imports
 * `./main` or reads page markup (OT.R12).
 *
 * Sprint 20, SVC-20b-page (W20.R9: one state machine): the menu is the talk input's (`./voice/talkInput` `TalkInput.menu`),
 * which the part holds and feeds once a frame; CIRCLE held past 0.3 s is the talk, its flag handed back by `pad` for the
 * voice client (`./voice/voiceClient`). The round's preset is Default (OQ-6: no options row yet); RUN AND TALK is the START
 * menu's (MATCH-01, `runAndTalk`), OFF until it is turned on.
 *
 * SVC-22b (research 226 §5): the part makes the headset UX (`./voice/headset`) both pages hand the voice client
 * (`headset`): its lines on the HUD's message line, the pad's loss and the window's focus as the talk input's
 * `padPresent` / `focused` (browser releases, research 197 §2), the round's phase for VOICE MODULATION, and the DEV talk
 * key (V) put into the held set as CIRCLE -- the same talk input, no second state machine (W20.R9).
 *
 * Input ownership (research 301 §7, a browser safeguard): while the menu holds the pad, the game's lanes take nothing,
 * a button it took stays the menu's until let go (`./exchangeInput`), and its opening lets the trigger go and cancels
 * an uncommitted held grenade (`release`: no throw, no ammunition spent) -- before the trigger lane hears R1 let go.
 */

/** The part's `NetPage` hooks, as `PART_DEPS.taunts` lists them. */
export type MatchTauntsNetDeps = Required<Pick<NetPageDeps, (typeof PART_DEPS)['taunts'][number]>>;

/** A taunt the page heard (the browser spec's hook, `state`). */
export interface HeardTaunt { sender: number; request: number; text: string; sound: string | null; result: string }

/** What the part reads. */
export interface MatchTauntsDeps {
  net(): NetPage | null;
  hud: Pick<Hud, 'postMessage'>;
  /** The match's audio (`./matchSound` `MatchSound.audio`): the menu's `.TCM_SLIDE` / `.TCM_SELECT`, the vocals' streams. */
  audio: Pick<GameAudio, 'play' | 'playStream'>;
  /** The five as the page holds them (the card's, else the defaults `dlgNetLogin` set); null for one not held. */
  custom(): readonly (string | null)[];
  /** Another screen holds the pad (the loading hold, the ARMORY, WEAPON EXCHANGE, the R2 inventory): no menu opens. */
  otherMenu(): boolean;
  /** The trigger let go and an uncommitted held grenade cancelled (no throw), as the menu takes the pad. */
  release(): void;
  /** Seconds (the menu's clock); absent, `performance.now()`. */
  clock?(): number;
  /** The rows of the menu's other roots (`./matchChat` `entries`: TACTICAL ORDERS, MESSAGES); absent, none. */
  entries?(root: number): ChatEntry[];
  /** The headset UX (SVC-22b); absent, the part's own on the page's window, document and pads, its lines on `hud`. */
  headset?: Headset;
  /**
   * MATCH-01 (research 266 §8.4): RUN AND TALK as the START menu leaves it (`DAT_0044d4f8`, `./startMenu`
   * `StartMenu.runAndTalk`), read each frame; absent, OFF (the global is .bss).
   */
  runAndTalk?(): boolean;
  /**
   * MATCH-02 (research 266 §8.10): ABORT confirmed, `mission_abort` held (`./matchAbort` `MatchAbort.aborting`): the
   * state-4 ticks hold the talk flag off (`FUN_0030e6e0(voice, 0)`, `FUN_002a9b30` D:L150618); absent, never.
   */
  aborting?(): boolean;
  /** ONL-16b (W20.R9): the game lobby's talk input, handed on at the launch (`./gameLobbyHost` `LobbyTalk`); absent, a new one. */
  talk?: { adopt(deps: ConstructorParameters<typeof TalkInput>[0]): TalkInput };
}

/** The browser spec's view of the part. */
export interface TauntsState {
  open: boolean; root: number; row: number; depth: number; nextSend: number; cooldowns: number[]; voiceHeld: boolean;
  /** Another root's open columns (`./matchChat`'s rows: TACTICAL ORDERS, MESSAGES); none on TAUNTS. */
  columns: ChatColumn[];
  /** SVC-23f: the roots drawn, in the tree's order (`./tauntMenu`: SPECTATORS while a spectator is present). */
  roots: number[];
  defaults: string[]; custom: string[]; received: HeardTaunt[];
}

export interface MatchTaunts {
  readonly menu: TauntMenu;
  /** The talk input that owns the menu (W20.R9): its flag is `pad`'s `talk`. */
  readonly talk: TalkInput;
  /** The headset UX (SVC-22b) the voice client takes (`mountVoice`'s `headset`). */
  readonly headset: Headset;
  isOpen(): boolean;
  /** The map's sound data (`./soundData`'s `taunts`: the vocals, the defaults, the captions); null between maps. */
  setData(data: SoundData | null): void;
  /** The five as the menu shows and sends them: the page's, a HudCLOC key resolved, else the disc's defaults. */
  texts(): string[];
  /** The room's taunts heard (`PART_DEPS.taunts`). */
  netDeps(): MatchTauntsNetDeps;
  /**
   * The pad's frame, before the game's lanes: the buttons held (`padButtonsDown`) to the talk input and its menu; whether
   * the menu holds the pad, the input the game's lanes get -- none while it does, a button it took held off until let go --
   * and the talk flag (SVC-20b-page: the voice client's `pad`).
   */
  pad(held: ReadonlySet<PadButton>, input: Input): { owns: boolean; input: Input; talk: boolean };
  /** The menu on the HUD's overlay (layer 1, beside the R2 inventory and WEAPON EXCHANGE). */
  draw(frame: { width: number; height: number }, sizes: Record<string, { width: number; height: number }>): { quads: HudQuad[]; tris: HudTri[] };
  /** Closed (a death, a respawn, a new map). */
  reset(): void;
  state(): TauntsState;
  /** Everything let go: the menu closed, its held buttons forgotten, the map's data and the heard list gone. */
  dispose(): void;
}

/** The menu's root rows, as `FUN_002344e0` builds them; TAUNTS here, TACTICAL ORDERS and MESSAGES `./matchChat`'s (research 302 §3). */
const UNSUPPORTED = 'NOT WIRED IN THIS BUILD';

/** How many heard taunts the dedup remembers (a sender's request once: research 301 §7). */
const HEARD_KEPT = 100;

/**
 * DEATH_CLOSE_IDLE_TIMER_READING (AD-10, research 227 §2.9): the death edge (`FUN_001f7ff0` D:L56631-56644) calls
 * `FUN_00235300(menu, 0)` whether or not the menu is open, which sets the shared TeamCommand timer `+0xdb4` to 0.3 s
 * (D:L83944-83946) and the menu's state to 3 (D:L83947-83951). The port closes an open menu through the talk input's
 * own close (its 0.3 s timer, `./voice/talkInput` `VOICE_TALK_LOCKOUT_READING.menuClose`); a closed menu at the edge
 * is left as it is -- no 0.3 s timer, and a talk under way (route A, the menu's state 5) is not moved to state 3,
 * whose effect on the talk flag is not read. [reading]
 */
export const DEATH_CLOSE_IDLE_TIMER_READING = 'open menu only' as const;

export function mountTaunts(d: MatchTauntsDeps): MatchTaunts {
  const clock = d.clock ?? ((): number => performance.now() / 1000);
  let data: TauntData | null = null;
  let request = 0;
  const heard: HeardTaunt[] = [];
  const consume = new ExchangeInput();
  const headset = d.headset ?? mountHeadset({ line: (text) => { d.hud.postMessage(text); } });
  const texts = (): string[] => {
    const own = d.custom();
    return Array.from({ length: TAUNT_SLOTS }, (_, i) => tauntText(own[i] ?? null, data?.captions ?? {}, data?.defaults[i] ?? ''));
  };
  const menuDeps: ConstructorParameters<typeof TalkInput>[0] = {
    custom: texts,
    ...(d.entries ? { entries: (root: number) => d.entries!(root) } : {}),
    // AD-10: the roots drawn by the page's role (`./tauntMenu` `rootEnabled`), read at each opening.
    role: () => { const g = d.net()?.gate(); return { alive: !!g?.alive, spectator: !!g?.spectator }; },
    // OBF-20 (the review's F1): on from the resume's last request (`NetClient.requestFloor`), never under it.
    send: (choice) => { if (screens()) return; const c = d.net()?.client; request = Math.max(request, c?.requestFloor?.('taunt') ?? 0) + 1; c?.send({ type: 'taunt', ...choice, request }); },
    sound: (name) => { d.audio.play(name, null); },
    // A parked root or row stays visible and does nothing (research 301 §3, 302 §3); a development build says so on the message line.
    unsupported: (name) => { if (import.meta.env.DEV) d.hud.postMessage(`${name}: ${UNSUPPORTED}`); },
  };
  /**
   * OBF-31 (`./matchSound` `ROUND_SCREENS_STOP_ALL_READING`; the review's F1): a round screen up -- MPExitState alone is
   * ticked (`FUN_002ce9e0` D:L171877-171888), so no vocal plays and the menu neither opens nor sends; the room's
   * acceptance is the room's. Absent (no NetPage), never.
   */
  const screens = (): boolean => d.net()?.screenUp?.() ?? false;
  const talk = d.talk?.adopt(menuDeps) ?? new TalkInput(menuDeps);
  const menu = talk.menu;
  /** The page's actor alive on the last pad frame: the death edge's other half (`DAT_00408f08`, D:L56754). */
  let wasAlive = false;
  /** The room's taunt: once a sender's request; its text on the message line, a character's vocal at the sender. */
  const taunt = (ev: Extract<ServerEvent, { type: 'taunt' }>): void => {
    if (heard.some((t) => t.sender === ev.sender && t.request === ev.request)) return;
    const vocal = ev.vocal === null ? null : data?.vocals[ev.team]?.[ev.char]?.[ev.vocal] ?? null;
    const name = botDisplayName(ev.name, d.net()?.isBot?.(ev.sender) === true);
    const text = ev.text !== null ? `${name} : ${plainBotText(ev.text)}` : vocal?.text.replace(/%s/g, () => name) ?? `${name}: ORIGINAL TAUNT RECORD UNRESOLVED`;
    // The sender's own echo unplaced (`FUN_00343550`), another's at its body (`FUN_00342b20`: range and pan, research 301 §4).
    const own = ev.sender === d.net()?.client.id;
    const result = vocal ? (screens() ? 'screens' : d.audio.playStream(vocal.sound, own ? null : ev.at)) : ev.vocal === null ? 'text' : 'unsupported';   // OBF-31
    // HUD colour 5 (128,64,64,100): `0x005e7e98` -> `FUN_002b6530`, the table `FUN_002b7530` (research 301 §8).
    d.hud.postMessage([{ text, scale: 0.9, rgb: [1, 0.5, 0.5], opacity: 100 / 128 }]);
    heard.push({ sender: ev.sender, request: ev.request, text: plainBotText(text), sound: vocal?.sound ?? null, result });
    if (heard.length > HEARD_KEPT) heard.shift();
  };
  return {
    menu,
    talk,
    headset,
    isOpen: () => menu.isOpen(),
    setData: (s) => { data = s?.taunts ?? null; menu.reset(); },
    texts,
    netDeps: () => ({ taunt }),
    pad: (held, input) => {
      const gate = d.net()?.gate();
      // AD-10 (C86; research 227 §2.9): online, TeamCommand's release opens the menu for any actor -- the life test is
      // offline's only (`FUN_002359a0` D:L84284-84298); what it shows is each root's enable for the page's role
      // (`./tauntMenu` `rootEnabled`). AD-11 (C47; research 227 §2.10): an online spectator's opens too, on his tree,
      // RADIO alone (`FUN_001fa360` D:L57441-57448, `FUN_00232bc0`'s branch 2 D:L83641-83645: `./tauntMenu`
      // `SPECTATOR_ROOT_ORDER`); while it is open the pad is the menu's (`owns`), so the spectator's camera takes none
      // of it (the pages' `menuOpen` holds `taunts.isOpen()` for `NetPage.spectatorPad` and its keys).
      const allowed = !!data && !!gate?.inMatch && !d.otherMenu() && !screens();   // OBF-31: not under the round screens
      // The death edge (`FUN_001f7ff0` D:L56631-56644): the viewed actor alive on the last frame (`DAT_00408f08`,
      // D:L56754) and dead now, and it is the page's own (D:L56641-56642; a living player views itself), closes the menu
      // once -- `FUN_00235300(menu, 0)`, a close's 0.3 s timer -- through the talk input's own close; not a gate: the dead
      // reopen it. A closed menu at the edge is left alone (`DEATH_CLOSE_IDLE_TIMER_READING`).
      const alive = !!gate?.alive;
      const died = wasAlive && !alive;
      wasAlive = alive;
      // The talk's own gate (`./voice/talkInput` `talkAllowed`): in a match, no other screen over it. The dead and the
      // spectators talk too -- the online talk routes carry no alive test (`VOICE_DEAD_TALK_READING`, research 170 C4,
      // the strong reading); the room puts them on their own channel (constraint 3).
      const wasOpen = menu.isOpen();
      // SVC-22b: the pad's loss and the window's focus release the talk (browser adaptations); the DEV key is CIRCLE.
      const h = headset.frame({ phase: 'round', spectator: !!gate?.spectator });
      // OPT-14 (research 344 §7): the round's TeamCommand button is the active controller config's; the development key
      // stands for TeamCommand in every preset (OT.R29: a preset changes the pad's map only, never the keys).
      const preset = controllerConfigs.active;
      const keys = [...headset.keys('round')].map((b) => (b === 'Circle' ? VOICE_ROUND_TALK_BUTTON_READING[preset].teamCommand : b));
      const f = talk.frame(clock(), keys.length ? new Set([...held, ...keys]) : held, {
        phase: 'round', preset, runAndTalk: d.runAndTalk?.() ?? false, menuAllowed: allowed && !died, talkAllowed: !!gate?.inMatch && !d.otherMenu() && !(d.aborting?.() ?? false),
        lateJoiner: false, padPresent: h.padPresent, focused: h.focused,
      });
      const owns = wasOpen || menu.isOpen();
      if (owns) d.release();
      return { owns, input: consume.frame(input, owns), talk: f.talk };
    },
    draw: (frame, sizes) => drawTaunts(frame, menu.state(), texts(), clock(), sizes),
    reset: () => { menu.reset(); },
    state: () => ({ ...menu.state(), defaults: [...(data?.defaults ?? [])], custom: texts(), received: [...heard] }),
    dispose: () => { menu.reset(); consume.blur(); data = null; heard.length = 0; if (!d.headset) headset.dispose(); },
  };
}
