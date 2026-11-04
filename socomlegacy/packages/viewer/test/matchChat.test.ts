// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { noInput, type PadButton } from '../src/gamepad';
import { mountChat, MESSAGE_HELP, TACTICAL_HELP, type MatchChatDeps } from '../src/matchChat';
import { FRONT_END_CAPABILITIES, TESTROOM_CAPABILITIES } from '../src/matchCore';
import { PART_DEPS } from '../src/matchNet';
import { mountTaunts } from '../src/matchTaunts';
import type { ServerEvent } from '../src/net/protocol';
import type { SoundData } from '../src/soundData';
import type { TauntData } from '../src/tauntData';
import { plainBotText } from '../src/botPresentation';
import { layoutText } from '../src/hudFont';

/**
 * TACTICAL ORDERS and MESSAGES (web research 302 §3): the part both pages mount (`../src/matchChat`) beside TAUNTS,
 * whose menu shows its rows -- the sends through the page's client, the room's communications heard (the message
 * line in colour 3, a tactical recording through the match's audio: the sender's echo unplaced, another's at its
 * body), the parked roots and rows doing nothing, and its one wiring: the capability on both switches, the hook one
 * line under `PART_DEPS`, both pages' call sites, no browser key. Fakes only.
 */

const record = (n: number) => ({ sound: `^PS_00${10 + n}`, text: `%s ORDER ${n}`, character: 'mp_seal1', label: `ORDER ${n}` });
const DATA = {
  defaults: ['T1', 'T2', 'T3', 'T4', 'T5'], captions: { '60757': 'GO LEFT' },
  vocals: { seal: [], terrorist: [] },
  messages: ['GO LEFT', 'GO RIGHT', 'GO MIDDLE', 'GO BOMB', 'GO HOSTAGES'],
  tactical: { seal: [Array.from({ length: 7 }, (_, n) => record(n))], terrorist: [Array.from({ length: 7 }, (_, n) => record(n))] },
} as unknown as TauntData;

function rig(o: { bot?: boolean; gameType?: number | null; messages?: (string | null)[]; missing?: string[]; spectators?: () => number; spectator?: boolean; teammates?: boolean; alive?: boolean; cameraOnSelf?: boolean } = {}) {
  let now = 0;
  const sent: Record<string, unknown>[] = [], posted: unknown[] = [], played: string[] = [], streams: [string, unknown][] = [], unsupported: string[] = [];
  const gate = { inMatch: true, alive: o.alive ?? true, cameraOnSelf: o.cameraOnSelf ?? true, spectator: o.spectator ?? false };
  const votes = new Set<number>();
  const net = {
    client: { id: 2, team: 'seal', send: (e: Record<string, unknown>) => { sent.push(e); } },
    rows: o.teammates ? [{ id: 2, name: 'Me', team: 'seal' }, { id: 3, name: 'Ally', team: 'seal', alive: false }, { id: 4, name: 'Enemy', team: 'terrorist' }] : [],
    isBot: (id: number) => id === 3 && o.bot === true,
    votingToRemove: (id: number) => votes.has(id),
    toggleVote: (id: number) => { const remove = !votes.has(id); if (remove) votes.add(id); else votes.delete(id); sent.push({ type: 'vote', target: id, remove }); return true; },
    gate: () => gate, gameType: () => (o.gameType === undefined ? 1 : o.gameType),
  };
  const audio: MatchChatDeps['audio'] = {
    playStream: (name, at) => { streams.push([name, at]); return 'played'; },
    hasStream: (name) => !(o.missing ?? []).includes(name),
  };
  const chat = mountChat({
    net: () => net as never, hud: { postMessage: (lines) => { posted.push(lines); }, ...(o.spectators ? { spectatorCount: o.spectators } : {}) }, audio,
    messages: () => o.messages ?? ['_60757_ImGoingLeft_MSG', 'HOLD THE BRIDGE', '', null, null], side: () => 'seal', character: () => 0,
  });
  chat.setData({ taunts: DATA } as unknown as SoundData);
  const t = mountTaunts({
    net: () => net as never, hud: { postMessage: (l) => { unsupported.push(String(l)); } },
    audio: { play: (name) => { played.push(name); return true as never; }, playStream: () => 'played' },
    custom: () => [], otherMenu: () => false, release: () => {}, clock: () => now, entries: chat.entries,
  });
  t.setData({ taunts: DATA } as unknown as SoundData);
  const frame = (held: PadButton[], dt = 0.05) => { now += dt; return t.pad(new Set(held), noInput()); };
  const tap = (b: PadButton) => { frame([b], 0.25); frame([], 0.05); };
  /** Opens the menu on root `root` (Down from TACTICAL ORDERS) and enters it. */
  const open = (root: number) => { tap('Circle'); for (let i = 0; i < root; i++) tap('Down'); tap('Cross'); };
  const advance = (s: number) => { now += s; };
  return { chat, t, net, sent, posted, played, streams, unsupported, tap, open, advance };
}

const comm = (over: Partial<Extract<ServerEvent, { type: 'communication' }>>): Extract<ServerEvent, { type: 'communication' }> => ({
  type: 'communication', sender: 3, name: 'kilo', team: 'seal', char: 0, request: 1, command: null, text: null, at: [10, 0, 0], ...over,
});

describe('TACTICAL ORDERS and MESSAGES on the Chat menu (research 302 §3)', () => {
  it('TACTICAL ORDERS lists the seven with the character\'s labels and the ELF\'s help lines; HOLD FIRE sends command 6', () => {
    const r = rig();
    r.open(0);
    const col = r.t.state().columns[0]!;
    expect(col.rows.map((x) => x.label)).toEqual(['ORDER 0', 'ORDER 1', 'ORDER 2', 'ORDER 3', 'ORDER 4', 'ORDER 5', 'ORDER 6']);
    expect(col.rows.map((x) => x.help)).toEqual([...TACTICAL_HELP]);
    r.tap('Cross');
    expect(r.sent).toEqual([{ type: 'communication', kind: 'tactical', command: 6, request: 1 }]);
    expect(r.t.isOpen()).toBe(false);
  });

  it("OBF-20 (the review's F1): a reloaded page numbers its orders on from its resume's last request (`requestFloor`), never from 1 under it", () => {
    const r = rig();
    (r.net.client as unknown as { requestFloor: (kind: string) => number }).requestFloor = (kind) => (kind === 'communication' ? 6 : 4);
    r.open(0);
    r.tap('Cross');
    expect(r.sent).toEqual([{ type: 'communication', kind: 'tactical', command: 6, request: 7 }]);
  });
  it('a game type\'s refused order and a recording the disc lacks do nothing: no send, no sound, the menu stays', () => {
    const r = rig({ gameType: 3, missing: ['^PS_0016'] });
    r.open(0);
    for (let i = 0; i < 4; i++) r.tap('Down');                   // DEFUSE (46): types 1-2 only
    const sounds = r.played.length;
    r.tap('Cross');
    expect([r.sent, r.played.length, r.t.isOpen()]).toEqual([[], sounds, true]);
    r.tap('Down'); r.tap('Down');                                // POINT (48): its recording not on the disc here
    r.tap('Cross');
    expect([r.sent, r.played.length, r.t.isOpen()]).toEqual([[], sounds + 2, true]);   // the two Downs' .TCM_SLIDE only
    r.tap('Up');                                                 // PROTECT (47): type 3 allows it
    r.tap('Cross');
    expect(r.sent).toEqual([{ type: 'communication', kind: 'tactical', command: 47, request: 1 }]);
  });

  it('MESSAGES lists the five (a HudCLOC key resolved, an empty one inert) with the ELF\'s help; one sends its slot and text', () => {
    const r = rig({ teammates: true });                          // AD-10: TEAMMATES drawn by its rows, so open(4)'s walk holds
    r.open(4);
    const col = r.t.state().columns[0]!;
    expect(col.rows.map((x) => x.label)).toEqual(['GO LEFT', 'HOLD THE BRIDGE', '', 'GO BOMB', 'GO HOSTAGES']);
    expect(col.rows.map((x) => x.help)).toEqual([...MESSAGE_HELP]);
    r.tap('Down'); r.tap('Down'); r.tap('Cross');                // the empty third: nothing
    expect(r.sent).toEqual([]);
    r.tap('Up'); r.tap('Cross');
    expect(r.sent).toEqual([{ type: 'communication', kind: 'custom', slot: 1, text: 'HOLD THE BRIDGE', request: 1 }]);
    expect(r.chat.messages()).toEqual(['GO LEFT', 'HOLD THE BRIDGE', '', 'GO BOMB', 'GO HOSTAGES']);
  });

  it('without voice RADIO opens nothing; without a teammate TEAMMATES is not drawn (AD-10: its rows all disabled, FUN_00231a30 D:L82568-82582)', () => {
    const r = rig();
    r.tap('Circle'); for (let i = 0; i < 2; i++) r.tap('Down');
    const sounds = r.played.length;
    r.tap('Cross');
    expect([r.t.state().root, r.t.state().depth, r.played.length, r.sent.length]).toEqual([2, 0, sounds, 0]);
    expect(r.t.state().roots).toEqual([0, 1, 2, 4]);
  });
});

describe('TEAMMATES vote from the normal pad/touch Chat menu', () => {
  it('does not send a cached menu action through a replacement connection', () => {
    const r = rig({ teammates: true });
    const vote = r.chat.entries(3)[0]!.children![0]!.action!;
    r.net.client = { ...r.net.client };
    vote();
    expect(r.sent).toEqual([]);
  });
  it('works without voice: includes a dead teammate, excludes self/enemies, casts and retracts', () => {
    const r = rig({ teammates: true });
    r.open(3);
    expect(r.t.state().columns[0]!.rows.map((x) => x.label)).toEqual(['Ally']);
    r.tap('Cross');
    expect(r.t.state().columns[1]!.rows[0]!.label).toBe('VOTE REMOVE');
    r.tap('Cross');
    expect(r.t.isOpen()).toBe(false);
    r.advance(6); r.open(3); r.tap('Cross');
    expect(r.t.state().columns[1]!.rows[0]!.label).toBe('VOTE RETAIN');
    r.tap('Cross');
    expect(r.sent).toEqual([{ type: 'vote', target: 3, remove: true }, { type: 'vote', target: 3, remove: false }]);
    expect(rig({ teammates: true, spectator: true }).chat.entries(3)).toEqual([]);
  });
  it('AD-10: a dead player\'s menu opens on TEAMMATES, its VOTE row active (FUN_0022f440 D:L81384-81396, FUN_0022f3c0 D:L81363-81370: no life test) and toggling', () => {
    const r = rig({ teammates: true, alive: false });
    r.tap('Circle');
    expect(r.t.state()).toMatchObject({ open: true, root: 3, roots: [3] });
    r.tap('Cross'); r.tap('Cross');                              // TEAMMATES > Ally
    expect(r.chat.entries(3)[0]!.children![0]!).toMatchObject({ label: 'VOTE REMOVE', key: 'vote:3' });
    expect(r.chat.entries(3)[0]!.children![0]!.unsupported).toBeUndefined();
    r.tap('Cross');                                              // VOTE REMOVE
    r.advance(6); r.tap('Circle'); r.tap('Cross'); r.tap('Cross');
    expect(r.t.state().columns[1]!.rows[0]!.label).toBe('VOTE RETAIN');
    r.tap('Cross');
    expect(r.sent).toEqual([{ type: 'vote', target: 3, remove: true }, { type: 'vote', target: 3, remove: false }]);
  });
});

describe("R4B-08 (r0004, VOTE_ROWS_CAMERA_GATE_READING): the vote rows only on the own body's camera (research 379 §1)", () => {
  // r0004 binds VOTE RETAIN:REMOVE and VOTE ALL ON:OFF to new enables (r4 0x2d1710, 0x2d15c0; the binding 0x234eb8,
  // 0x234f10) whose prologue enables the row only when the camera's viewed actor is the page's own (0x2d1720-0x2d1730) or
  // the page is a spectator (0x2d1738-0x2d1740); else disabled (0x2d1748). r0001's `FUN_0022f440` / `FUN_0022f210`
  // (D:L83803, D:L83805) had no such test -- superseded (OT.R97). A disabled row is not drawn; a parent all disabled is not.
  it('a dead player following a teammate: PLAYER n keeps MUTE alone, no VOTE row; SPECTATORS not drawn', () => {
    const r = rig({ teammates: true, alive: false, cameraOnSelf: false, spectators: () => 2 });
    expect(r.chat.entries(3).map((e) => e.children!.map((c) => c.label))).toEqual([['MUTE OFF']]);
    expect(r.chat.entries(5)).toEqual([]);
    r.tap('Circle');
    expect(r.t.state().roots).not.toContain(5);
  });
  it("a dead player on his own body's death camera, and a living player: VOTE and VOTE ALL as before", () => {
    for (const alive of [false, true]) {
      const r = rig({ teammates: true, alive, cameraOnSelf: true, spectators: () => 2 });
      expect(r.chat.entries(3)[0]!.children!.map((c) => c.label)).toEqual(['VOTE REMOVE', 'MUTE OFF']);
      expect(r.chat.entries(5).map((e) => e.label)).toEqual(['VOTE ALL REMOVE']);
    }
  });
});

describe('SVC-23f: SPECTATORS > VOTE ALL ON:OFF on the Chat menu (research 264 §4.3)', () => {
  it('no spectator in the room\'s score: SPECTATORS not drawn, MESSAGES fifth as before', () => {
    const r = rig({ spectators: () => 0, teammates: true });       // AD-10: TEAMMATES is drawn by its rows: a teammate
    r.tap('Circle');
    expect(r.t.state().roots).toEqual([0, 1, 2, 3, 4]);
    expect(r.chat.entries(5)).toEqual([]);
  });
  it('a spectator present: SPECTATORS drawn before MESSAGES; VOTE ALL REMOVE sends voteAll on, then VOTE ALL RETAIN sends it off', () => {
    let count = 2;
    const r = rig({ spectators: () => count, teammates: true });   // AD-10: TEAMMATES is drawn by its rows: a teammate
    r.tap('Circle');
    expect(r.t.state().roots).toEqual([0, 1, 2, 3, 5, 4]);
    for (let i = 0; i < 4; i++) r.tap('Down');
    expect(r.t.state().root).toBe(5);
    r.tap('Cross');
    expect(r.t.state().columns[0]!.rows).toEqual([{ label: 'VOTE ALL REMOVE', help: 'Vote to Retain or Remove all players', arrow: false }]);
    r.tap('Cross');
    expect([r.sent, r.t.isOpen()]).toEqual([[{ type: 'voteAll', on: true }], false]);
    r.advance(6);                                                // past the node's send delay (TAUNT_DELAY_SECONDS)
    r.tap('Circle'); for (let i = 0; i < 4; i++) r.tap('Down'); r.tap('Cross');
    expect(r.t.state().columns[0]!.rows.map((x) => x.label)).toEqual(['VOTE ALL RETAIN']);
    r.tap('Cross');
    expect(r.sent).toEqual([{ type: 'voteAll', on: true }, { type: 'voteAll', on: false }]);
    count = 0;
    expect(r.chat.entries(5)).toEqual([]);
  });
  it('a spectator\'s page is offered no SPECTATORS (its tree RADIO alone, D:L83641-83644); dispose clears the toggle', () => {
    expect(rig({ spectators: () => 3, spectator: true }).chat.entries(5)).toEqual([]);
    const r = rig({ spectators: () => 1 });
    r.chat.entries(5)[0]!.action!();
    expect(r.chat.entries(5)[0]!.label).toBe('VOTE ALL RETAIN');
    r.chat.dispose();
    expect(r.chat.entries(5)[0]!.label).toBe('VOTE ALL REMOVE');
  });
});

describe('the room\'s communications heard (PART_DEPS.chat)', () => {
  it('colours trusted bot initials in messages and teammate menu entries, the remaining name uncoloured, diagnostics plain', () => {
    const r = rig({ bot: true, teammates: true });
    r.net.rows[1]!.name = 'Freq';
    const entry = r.chat.entries(3)[0]!.label;
    expect(plainBotText(entry)).toBe('Freq');
    expect(layoutText(entry, 0, 0, 1).glyphs[3]!.rgb).toBeUndefined();
    r.chat.netDeps().communication(comm({ name: 'Freq', text: 'Hold here.' }));
    const posted = (r.posted[0] as { text: string }[])[0]!.text;
    expect(layoutText(posted, 0, 0, 1).glyphs[3]!.rgb).toBeUndefined();
    expect(r.chat.state().received[0]!.text).toBe('Freq : Hold here.');
    expect(r.net.rows[1]!.name).toBe('Freq');
  });
  it('a teammate\'s order: its record\'s text with the name, colour 3, its recording at the sender; once per request', () => {
    const r = rig(), heard = r.chat.netDeps().communication;
    heard(comm({ command: 23 })); heard(comm({ command: 23 }));
    expect(r.posted).toEqual([[{ text: 'kilo ORDER 2', scale: 0.9, rgb: [0.5, 1, 0.5], opacity: 100 / 128 }]]);
    expect(r.streams).toEqual([['^PS_0012', [10, 0, 0]]]);
    expect(r.chat.state().received).toEqual([{ sender: 3, request: 1, text: 'kilo ORDER 2', sound: '^PS_0012', result: 'played' }]);
  });
  it('the sender\'s own echo is unplaced; a message is text only', () => {
    const r = rig(), heard = r.chat.netDeps().communication;
    heard(comm({ sender: 2, command: 6 }));
    heard(comm({ sender: 3, request: 2, text: 'HOLD THE BRIDGE' }));
    expect(r.streams).toEqual([['^PS_0010', null]]);
    expect(r.chat.state().received.at(-1)).toMatchObject({ text: 'kilo : HOLD THE BRIDGE', sound: null, result: 'text' });
  });
});

describe('one wiring (ONE-WIRE): both switches mount it, its hook is one PART_DEPS line, both pages call it', () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  it('the capability on /testroom\'s and the front end\'s switch; `communication` under PART_DEPS.chat', () => {
    expect([TESTROOM_CAPABILITIES.chat, FRONT_END_CAPABILITIES.chat]).toEqual([true, true]);
    expect(PART_DEPS.chat).toEqual(['communication']);
  });
  it('main.ts and matchMount.ts mount the part, hand its rows to the Chat menu and its hook to matchNetDeps', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      const s = src(f);
      expect(s, f).toContain('mountChat({');
      expect(s, f).toContain('entries: chat.entries');
      expect(s, f).toContain('...chat.netDeps(),');
      expect(s, f).toContain('chat.setData(');
    }
    expect(src('matchMount.ts')).toContain('chat.dispose()');
  });
  it('adds no keyboard input: the Chat menu is the pad\'s, physical typing the soft keyboard\'s text entry alone (OT.R29)', () => {
    for (const f of ['matchChat.ts', 'communications.ts', 'messageSettings.ts', 'originalOptions.ts', 'tauntMenu.ts']) {
      expect(src(f), f).not.toMatch(/addEventListener|keydown|KeyboardEvent/);
    }
  });
  it('no browser key holds the messages or the options (the card is the store)', () => {
    for (const f of ['main.ts', 'matchChat.ts', 'messageSettings.ts', 'originalOptions.ts', 'frontEnd.ts', 'personaHost.ts', 'matchMount.ts']) {
      const s = src(f);
      expect(s, f).not.toContain('s2u.messages');
      expect(s, f).not.toContain('s2u.options');
      if (f !== 'main.ts') expect(s, f).not.toContain('localStorage');   // main.ts's own panel settings are the page's, not the game's
    }
  });
});
