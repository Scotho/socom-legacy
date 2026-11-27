import type { Settings } from '@s2u/card';
import { CREATE_CLAN, PLAYER_GAME_PASSWORD_VAR, setChatFilter, setOwnNameDisplay, setUiVarDisplayMask, setUiVarDisplayText, SPECTATOR_GAME_PASSWORD_VAR, uiVarDisplayChanged, type ChatSender } from '@s2u/ui';
import { pageSettings } from './pageStore';

/**
 * STREAMER-P1 (product track, **a browser adaptation** with no original; it changes nothing the game does, nothing on the
 * wire and nothing any other player sees): "Streamer mode" -- one master switch and four sub-rows, kept by this browser,
 * that hide what a stream should not carry: strangers' voice and chat in the lobbies, this player's own microphone
 * outside a match, and the room and account details a viewer could use to find or join the game. OT.R152 (the owner,
 * 2026-11-24: "Streamer mode thursday release"); the scope next-sprint/STREAMER-MODE-P1-SCOPE-2026-11-24.md (KiLL's ask,
 * 2026-11-21). Off by default: with the switch Off every getter reads its default, so the page is as before.
 */
export const STREAMER_MODE_ADAPTATION =
  'OT.R152 (the owner, 2026-11-24): "Streamer mode thursday release"; a browser adaptation, never parity, off by default. It hides what this browser shows, plays and sends; the game and every other player are unchanged.';

/** This browser's keys (`./pageStore` `PAGE_SETTING_KEYS` lists each). */
export const STREAMER_KEYS = {
  on: 's2u.viewer.streamer.on',
  voiceIn: 's2u.viewer.streamer.voiceIn',
  myVoice: 's2u.viewer.streamer.myVoice',
  chatIn: 's2u.viewer.streamer.chatIn',
  details: 's2u.viewer.streamer.details',
  /** The four sub-rows as they were when the mode was turned On (JSON), restored when it is turned Off. */
  saved: 's2u.viewer.streamer.saved',
} as const;

/** Voice and chat from others: everyone; in a match everyone, elsewhere friends and clan only; friends and clan only; none. */
export type FromOthers = 'everyone' | 'matches-friends' | 'friends' | 'off';
/** My voice: sent everywhere, in a match only, or never (a send reaches the whole room, so it has no friends choice). */
export type MyVoice = 'everywhere' | 'matches' | 'off';
export type Details = 'shown' | 'hidden';
/** Where a voice or a chat line is heard: the game lobby and briefing rooms, or a match. */
export type StreamerPlace = 'lobby' | 'match';

export const VOICE_IN_CHOICES: readonly FromOthers[] = ['everyone', 'matches-friends', 'friends', 'off'];
export const CHAT_IN_CHOICES: readonly FromOthers[] = VOICE_IN_CHOICES;
export const MY_VOICE_CHOICES: readonly MyVoice[] = ['everywhere', 'matches', 'off'];
export const DETAILS_CHOICES: readonly Details[] = ['shown', 'hidden'];

export const FROM_OTHERS_WORDS: Readonly<Record<FromOthers, string>> = {
  everyone: 'Everyone', 'matches-friends': 'Matches + friends & clan', friends: 'Friends & clan only', off: 'Off',
};
export const MY_VOICE_WORDS: Readonly<Record<MyVoice, string>> = { everywhere: 'Everywhere', matches: 'Matches only', off: 'Off' };
export const DETAILS_WORDS: Readonly<Record<Details, string>> = { shown: 'Shown', hidden: 'Hidden' };

export interface StreamerRows { readonly voiceIn: FromOthers; readonly myVoice: MyVoice; readonly chatIn: FromOthers; readonly details: Details }
export type StreamerRow = keyof StreamerRows;
export interface StreamerState { readonly on: boolean; readonly rows: StreamerRows }

/** Each sub-row unset, and in force while the mode is Off: the page as it was before streamer mode. */
export const STREAMER_DEFAULTS_ADAPTATION: StreamerRows = Object.freeze({ voiceIn: 'everyone', myVoice: 'everywhere', chatIn: 'everyone', details: 'shown' });
/** What turning the mode On writes into the sub-rows (the scope's s2 table); the player may change any of them after. */
export const STREAMER_PRESET_ADAPTATION: StreamerRows = Object.freeze({ voiceIn: 'matches-friends', myVoice: 'matches', chatIn: 'matches-friends', details: 'hidden' });

const CHOICES: { readonly [K in StreamerRow]: readonly StreamerRows[K][] } = {
  voiceIn: VOICE_IN_CHOICES, myVoice: MY_VOICE_CHOICES, chatIn: CHAT_IN_CHOICES, details: DETAILS_CHOICES,
};
const ROWS: readonly StreamerRow[] = ['voiceIn', 'myVoice', 'chatIn', 'details'];

function rowOf<K extends StreamerRow>(row: K, v: unknown): StreamerRows[K] {
  return (CHOICES[row] as readonly unknown[]).includes(v) ? v as StreamerRows[K] : STREAMER_DEFAULTS_ADAPTATION[row];
}

function storedRows(settings: Settings): StreamerRows {
  return {
    voiceIn: rowOf('voiceIn', settings.get(STREAMER_KEYS.voiceIn)),
    myVoice: rowOf('myVoice', settings.get(STREAMER_KEYS.myVoice)),
    chatIn: rowOf('chatIn', settings.get(STREAMER_KEYS.chatIn)),
    details: rowOf('details', settings.get(STREAMER_KEYS.details)),
  };
}

/**
 * What this browser keeps: the switch, and the sub-rows as stored (the player's choices -- in force only while the switch
 * is On; the getters below read the defaults while it is Off). Unset or unknown, Off and the defaults.
 */
export function readStreamer(settings: Settings = pageSettings): StreamerState {
  return { on: settings.get(STREAMER_KEYS.on) === 'on', rows: storedRows(settings) };
}

/** The page's state, read once and kept (the getters run on every voice frame and every draw); a save updates it. */
let live: StreamerState | null = null;
const listeners = new Set<() => void>();

function changed(settings: Settings): void {
  if (settings === pageSettings) live = null;
  for (const f of [...listeners]) { try { f(); } catch { /* one listener's fault is its own */ } }
}

/**
 * Another tab's change (the review's F2): the page's keys written in another tab of this browser arrive as a `storage`
 * event; the kept state is dropped and the listeners told, so this tab's masks, tag and rows follow. Returns the removal.
 */
export function followOtherTabs(win: Pick<Window, 'addEventListener' | 'removeEventListener'>): () => void {
  const prefix = 's2u.viewer.streamer.';
  const onStorage = (ev: Event): void => {
    const key = (ev as StorageEvent).key;
    if (key !== null && key !== undefined && !key.startsWith(prefix)) return;   // null: the storage cleared
    changed(pageSettings);
  };
  win.addEventListener('storage', onStorage);
  return () => { win.removeEventListener('storage', onStorage); };
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') followOtherTabs(window);

/** For tests: forget the kept state, so the next read takes the stored keys. */
export function resetStreamerCache(): void { live = null; }

/** Told after every change of the switch or a row (the header's tag, the options' rows); returns the unsubscribe. */
export function onStreamerChange(f: () => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}

function stateOf(settings: Settings): StreamerState {
  if (settings !== pageSettings) return readStreamer(settings);
  if (live === null) {
    try { live = readStreamer(settings); } catch { return { on: false, rows: STREAMER_DEFAULTS_ADAPTATION }; }
  }
  return live;
}

/** One sub-row saved (the player's choice, from the options' row). */
export function saveStreamerRow<K extends StreamerRow>(row: K, value: StreamerRows[K], settings: Settings = pageSettings): void {
  settings.set(STREAMER_KEYS[row], value);
  changed(settings);
}

/**
 * The master switch. On: the sub-rows as they are now are kept (`STREAMER_KEYS.saved`) and the preset written over them.
 * Off: the kept copy is written back and forgotten. Setting it to what it already is does nothing.
 */
export function setStreamerMode(on: boolean, settings: Settings = pageSettings): void {
  const was = readStreamer(settings);
  if (was.on === on) { if (stateOf(settings).on !== on) changed(settings); return; }   // the kept state was stale: told now
  if (on) {
    settings.set(STREAMER_KEYS.saved, JSON.stringify(was.rows));
    for (const r of ROWS) settings.set(STREAMER_KEYS[r], STREAMER_PRESET_ADAPTATION[r]);
    settings.set(STREAMER_KEYS.on, 'on');
  } else {
    let saved: Partial<Record<StreamerRow, unknown>> = {};
    try { const v: unknown = JSON.parse(settings.get(STREAMER_KEYS.saved) ?? '{}'); if (v && typeof v === 'object') saved = v as typeof saved; } catch { /* none kept: the defaults */ }
    for (const r of ROWS) settings.set(STREAMER_KEYS[r], rowOf(r, saved[r]));
    settings.remove(STREAMER_KEYS.saved);
    settings.set(STREAMER_KEYS.on, 'off');
  }
  changed(settings);
}

/** The live getters: while the switch is Off, each reads its default (the page as before). */
export const streamerModeOn = (settings: Settings = pageSettings): boolean => stateOf(settings).on;
const inForce = (settings: Settings): StreamerRows => { const s = stateOf(settings); return s.on ? s.rows : STREAMER_DEFAULTS_ADAPTATION; };
export const voiceFromOthers = (settings: Settings = pageSettings): FromOthers => inForce(settings).voiceIn;
export const myVoice = (settings: Settings = pageSettings): MyVoice => inForce(settings).myVoice;
export const chatFromOthers = (settings: Settings = pageSettings): FromOthers => inForce(settings).chatIn;
export const detailsHidden = (settings: Settings = pageSettings): boolean => inForce(settings).details === 'hidden';

/**
 * The one rule for voice and chat from others: `friendOrClan` is the social set's answer for the sender (`./socialSet`;
 * false where it cannot be trusted). Matches + friends & clan: everyone in a match, friends and clan elsewhere.
 */
export function streamerAllows(choice: FromOthers, place: StreamerPlace, friendOrClan: boolean): boolean {
  switch (choice) {
    case 'everyone': return true;
    case 'matches-friends': return place === 'match' || friendOrClan;
    case 'friends': return friendOrClan;
    case 'off': return false;
  }
}

/** True where this player's own voice may be sent from `place` (My voice). */
export const myVoiceAllowed = (place: StreamerPlace, settings: Settings = pageSettings): boolean => {
  const v = myVoice(settings);
  return v === 'everywhere' || (v === 'matches' && place === 'match');
};

// ---- Room and account details (s3.4) ----

/** A GAME DETAILS line, a room's or a server's name, as drawn while details are Hidden. */
export const HIDDEN_DETAIL_WORDS = 'Hidden (streamer mode)';
/** This player's own account name, as drawn while details are Hidden. */
export const OWN_NAME_HIDDEN_WORDS = 'YOU';
/** The indicator's words (the launcher header, the pause and options screens; never the in-round HUD). */
export const STREAMER_TAG_WORDS = 'STREAMER MODE';

/** A detail as drawn: unchanged, or HIDDEN_DETAIL_WORDS while details are Hidden. */
export const mask = (text: string, settings: Settings = pageSettings): string => (detailsHidden(settings) ? HIDDEN_DETAIL_WORDS : text);
/** This player's own account name as drawn: unchanged, or "YOU" while details are Hidden. */
export const ownNameShown = (name: string, settings: Settings = pageSettings): string => (detailsHidden(settings) ? OWN_NAME_HIDDEN_WORDS : name);
/** A password as drawn while details are Hidden: one asterisk a character, so entry still shows its length. */
export const maskPassword = (text: string, settings: Settings = pageSettings): string => (detailsHidden(settings) ? '*'.repeat(text.length) : text);

/**
 * The game passwords (`@s2u/ui` `PLAYER_GAME_PASSWORD_VAR`, `SPECTATOR_GAME_PASSWORD_VAR`: CREATE GAME's and a private
 * game's entry, typed through the soft keyboard) drawn as asterisks while details are Hidden -- the ui package's display
 * mask (`setUiVarDisplayMask`), set once this module loads (every page that draws the front end loads it). Entry, the
 * variable's value and what is sent are unchanged; the original draws these fields as typed.
 */
export const GAME_PASSWORD_VARS: readonly string[] = [PLAYER_GAME_PASSWORD_VAR, SPECTATOR_GAME_PASSWORD_VAR];
/**
 * The clan password: the roster leader's page (`dlgManageRosterLeader.rdr`, its TEXT `txtClanPassword`, read off the
 * disc's READERC through `loadDialog`) prints this UIVAR as plain text, so it is masked like the game passwords while
 * details are Hidden (the controller's word, 2026-11-24). Unlike CREATE GAME's two SECURETEXT fields, the original draws
 * it in clear, so here the mask is the only thing that hides it.
 */
export const CLAN_PASSWORD_VAR = 'Clan_Password';
/** Every UIVAR the display mask draws as asterisks while details are Hidden. */
export const MASKED_PASSWORD_VARS: readonly string[] = [...GAME_PASSWORD_VARS, CLAN_PASSWORD_VAR];
const PASSWORD_KEYS = new Set(MASKED_PASSWORD_VARS.map((n) => n.toUpperCase()));
setUiVarDisplayMask((name) => PASSWORD_KEYS.has(name.toUpperCase()) && detailsHidden());
/** IQ-183: the own name on the front end's own screens (the game lobby's and briefing room's own seat, row and line) as `ownNameShown` draws it. */
setOwnNameDisplay((name) => ownNameShown(name));

// ---- Who is a friend or clan mate (slice 3's social set) ----

/** Who a line or a voice is from: the account id where it is carried, else the name. */
export type SocialWho = ChatSender;
let social: ((who: SocialWho) => boolean) | null = null;
let socialEnsure: (() => void) | null = null;

/**
 * The social set's answer (`./socialSet`: this player's friends list and clan roster; a name trusted only where names are
 * fixed to accounts), set by it; null, or one that throws, makes everyone a stranger.
 */
export function setSocialLookup(f: ((who: SocialWho) => boolean) | null, ensure: (() => void) | null = null): void { social = f; socialEnsure = ensure; }
/** A lobby or a match mounting: the social set asks its lists once if they were never read this session (s3.5 "Load timing"). */
export function ensureSocialLoaded(): void {
  // Only while Streamer mode is on and a "friends & clan" choice is in force (the review's F1): Off, nothing is asked --
  // the game's own requests and screens are untouched.
  const rows = inForce(pageSettings);
  const wantsSocial = (c: FromOthers): boolean => c === 'matches-friends' || c === 'friends';
  if (!streamerModeOn() || !(wantsSocial(rows.voiceIn) || wantsSocial(rows.chatIn))) return;
  try { socialEnsure?.(); } catch { /* not asked: friends stay strangers */ }
}
export function friendOrClan(who: SocialWho): boolean {
  if (!social) return false;
  try { return social(who); } catch { return false; }
}

/**
 * A speaker's friend-or-clan test by seat id, through a table of seat names (the round's `NetPage.nameOf`): the voice
 * client's `friendOrClan` in a match (IQ-229 F1: the hand-off's known gap 4). No name, or a table that throws: a stranger.
 */
export const friendOrClanBySeat = (nameOf: (id: number) => string | null) => (id: number): boolean => {
  ensureSocialLoaded();   // the IQ-229 review's (iii): a round entered with no game lobby still asks the lists (once a ticket; Off: nothing)
  let name: string | null;
  try { name = nameOf(id); } catch { return false; }
  return name !== null && friendOrClan({ name });
};

/**
 * Chat from others, the one rule (s3.3): whether another player's incoming line is drawn at `place`. The ui package's
 * screens ask it through their chat filter (`@s2u/ui` `setChatFilter`, set below); the round's drain asks it directly
 * (`./roundChat`). The player's own lines are never asked.
 */
export function streamerChatShows(place: StreamerPlace, who: SocialWho): boolean {
  return streamerAllows(chatFromOthers(), place, friendOrClan(who));
}
setChatFilter((place, who) => streamerChatShows(place, who));

/**
 * The own account name as the front end prints it (the controller's ruling, 2026-11-24 20:13Z): these UIVARs draw
 * OWN_NAME_HIDDEN_WORDS while details are Hidden -- PLAYER_NAME_AND_TAG (17 dialogs' WRAPPEDTEXT `playername`, the name
 * with its clan tag, so the tag goes with it), PLAYERNAMEVAR (`playername` TEXTs: the LAN briefing room, the net connect
 * and usage policy pages) and LANPLAYERNAMEVAR (CREATE GAME's LAN foot, the TEXT `LANplayername`), all read off the disc's READERC/READERX through
 * `loadDialog`. The name-entry pages (dlgNetPlayerName, dlgLANPlayerName) print the same vars in `playername_val`, left
 * as typed (the help says so). Another player's name (PLAYER_INFO_NAME_VAR) is not this rule's. The own name in a list
 * (ROOMPLAYERLISTVAR, the CLAN_ROSTER lists, PLAYERTACOVAR, MvpName) is not reached either: LATER 1553, the help says so.
 */
export const OWN_NAME_VARS: readonly string[] = ['PLAYER_NAME_AND_TAG', 'PLAYERNAMEVAR', 'LANPLAYERNAMEVAR'];
/** The widget a name-entry page prints the typed name in: left as typed. */
export const NAME_ENTRY_WIDGET = 'playername_val';
/** The clan name (6 dialogs' TEXT `txtClanName`, read off the disc the same way): HIDDEN_DETAIL_WORDS while Hidden. */
export const CLAN_NAME_VAR = 'CLANNAMEVAR';
/**
 * The dialog where a new clan's name is typed (`@s2u/ui` CREATE_CLAN): its `txtClanName` is left as typed, as the
 * name-entry fields are, so the player can re-read it before Create Clan (the controller's F1 ruling, 2026-11-24).
 */
export const CLAN_NAME_ENTRY_DIALOG = CREATE_CLAN;
const OWN_NAME_KEYS = new Set(OWN_NAME_VARS.map((n) => n.toUpperCase()));
setUiVarDisplayText((name, widget, dialog) => {
  if (!detailsHidden()) return null;
  const key = name.toUpperCase();
  if (OWN_NAME_KEYS.has(key)) return widget.toLowerCase() === NAME_ENTRY_WIDGET ? null : OWN_NAME_HIDDEN_WORDS;
  if (key !== CLAN_NAME_VAR) return null;
  return dialog?.toLowerCase() === CLAN_NAME_ENTRY_DIALOG.toLowerCase() ? null : HIDDEN_DETAIL_WORDS;
});
/** A toggle (the switch, the details row, another tab's change) redraws an open menu page's text (the controller's ruling (d)). */
onStreamerChange(() => { uiVarDisplayChanged(); });

// ---- The hotkey ----

/**
 * The hotkey (a browser adaptation; the console has no keyboard, and no pad button is free): Ctrl+Shift+S toggles the
 * master switch from any page, also while a text field has the focus. No keyboard map of the game, the menus, the dev
 * keys (`./voice/headset` V / R) or the round binds Shift, and none binds the chord; the Forge's Ctrl+S is without Shift.
 * In a match Ctrl alone is the crouch (`./walk` `STANCE_CTRL_KEYS`), so a chord begun with Ctrl also crouches -- the
 * player's own key, as any Ctrl press is; the menus and the soft keyboard take no key held with Ctrl. Some browsers have their
 * own Ctrl+Shift+S (Firefox's screenshot, Edge's web capture); the page's keydown takes it first where the browser lets it.
 */
export const STREAMER_HOTKEY_ADAPTATION = 'Ctrl+Shift+S: Streamer mode on / off, with a 2-second toast (a browser adaptation)';
export const STREAMER_TOAST_MS_ADAPTATION = 2000;

export function isStreamerHotkey(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>): boolean {
  return e.code === 'KeyS' && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey;
}

/** The toast's words for the state just set. */
export const streamerToastWords = (on: boolean): string => `Streamer mode ${on ? 'on' : 'off'}`;

type Toast = (words: string, ms: number) => void;
/** Per target, one listener and a stack of toasts: the top one says the change (the launcher over the game page's own). */
const hotkeys = new WeakMap<object, { sinks: { toast: Toast; settings: Settings }[]; onKey: (ev: Event) => void }>();

/**
 * Listens for the chord on `target` (the window, in the capture phase, so a field or a page handler that stops the key
 * does not swallow it) and toggles the switch, then the newest installed `toast(words, ms)` says it. Installing again on
 * the same target adds no second listener (one press, one toggle): it stacks its toast over the earlier one until removed.
 * Returns the removal.
 */
export function installStreamerHotkey(
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
  toast: Toast,
  settings: Settings = pageSettings,
): () => void {
  let entry = hotkeys.get(target);
  if (!entry) {
    const e0: { sinks: { toast: Toast; settings: Settings }[]; onKey: (ev: Event) => void } = { sinks: [], onKey: () => {} };
    e0.onKey = (ev: Event): void => {
      const e = ev as KeyboardEvent;
      const top = e0.sinks[e0.sinks.length - 1];
      if (!top || e.repeat || !isStreamerHotkey(e)) return;
      e.preventDefault();
      const on = !readStreamer(top.settings).on;              // the stored switch, never a stale kept one (the review's F2)
      setStreamerMode(on, top.settings);
      top.toast(streamerToastWords(on), STREAMER_TOAST_MS_ADAPTATION);
    };
    target.addEventListener('keydown', e0.onKey, true);
    hotkeys.set(target, e0);
    entry = e0;
  }
  const sink = { toast, settings };
  entry.sinks.push(sink);
  const held = entry;
  return () => {
    const k = held.sinks.indexOf(sink);
    if (k >= 0) held.sinks.splice(k, 1);
    if (held.sinks.length === 0 && hotkeys.get(target) === held) { target.removeEventListener('keydown', held.onKey, true); hotkeys.delete(target); }
  };
}

/** The toast's element id on a page with no launcher (the game page): one, replaced in place. */
export const STREAMER_TOAST_ID = 's2u-streamer-toast';

/**
 * A page's own toast (the game page, which has no launcher toast): the system's notice, fixed at the top centre, for
 * `ms`; one at a time. Not the in-round HUD's: a DOM line over the page, gone after two seconds.
 */
export function domToast(doc: Document): Toast {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (words, ms) => {
    let el = doc.getElementById(STREAMER_TOAST_ID);
    if (!el) {
      el = doc.createElement('p');
      el.id = STREAMER_TOAST_ID;
      el.className = 's2u-notice';
      el.setAttribute('role', 'status');
      el.dataset['adaptation'] = 'STREAMER_MODE_ADAPTATION';
      el.style.position = 'fixed';
      el.style.top = '8px';
      el.style.left = '50%';
      el.style.transform = 'translateX(-50%)';
      el.style.margin = '0';
      el.style.zIndex = '1002';
      el.style.pointerEvents = 'none';
      doc.body.append(el);
    }
    el.textContent = words;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { doc.getElementById(STREAMER_TOAST_ID)?.remove(); timer = null; }, ms);
  };
}
