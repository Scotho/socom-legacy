import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { Hud, MESSAGE_SCALE } from '../src/hud';
import { MESSAGE_COLOURS } from '../src/matchMessages';
import { NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import {
  EXTERNAL_WHISPERS_INITIAL, ROUND_ACTOR_NAMES_READING, ROUND_LINE_KIND, externalWhispers, mountRoundChat,
  roundQueueLine,
} from '../src/roundChat';
import type { WalkMode } from '../src/walk';

/**
 * SVC-19 (web research 266 §3): the round's chat on the page.
 *
 * - **The round's frame drains the lobby server's queue** (`FUN_001f7ff0` D:L56708-56719): each queued line -- the
 *   `"%s: %s"` of `FUN_002f4ef0` (D:L194798), its kind and its sender's name (`FUN_002a4050` D:L147615-147669) -- is
 *   posted on the HUD's message window (`FUN_002b6530(0, 0x4366a0, text, kind, 0, 0)`: the window's scale, the kind's
 *   colour, not centred) unless it is a whisper (kind 5) while `DAT_003de620` -- EXTERNAL WHISPERS, set by
 *   `FUN_002a41f0` D:L147670-147692 -- is 0 and no actor of the round bears the sender's name (`FUN_0029e590`
 *   D:L144706-144720 over 0x4362e0, the names compared case-blind by `FUN_00198b80` D:L15551). A dropped line is gone:
 *   the loop dequeues it either way.
 * - **The game session's line in the round** (`FUN_002ba9d0` D:L160117-160195) only joins the game lobby's panel
 *   (BCHATLISTVAR, the game object's +0x94): no HUD post. The page's match hands the room's `chat` on (`gameChat`).
 *
 * Synthetic lines; nothing measured on the original running. Reading, pending review.
 */

describe('the round\'s queue drain (FUN_001f7ff0 D:L56708-56719): the HUD\'s message window', () => {
  const inRound = (names: string[]) => (n: string): boolean => names.some((m) => m.toLowerCase() === n.toLowerCase());

  it('names the two kinds the queue holds out of state 11 and EXTERNAL WHISPERS\' initial value (DAT_003de620 = 1 in the ELF\'s data)', () => {
    expect(ROUND_LINE_KIND).toEqual({ universe: 1, whisper: 5 });
    expect(EXTERNAL_WHISPERS_INITIAL).toBe(1);
    expect(ROUND_ACTOR_NAMES_READING).toBe('the round\'s players by the score\'s rows, the page\'s own and the dead among them');
  });

  it('a whisper: drawn "name: text" at the window\'s scale in colour 5 while EXTERNAL WHISPERS is on', () => {
    const [r, g, b] = MESSAGE_COLOURS[5]!;
    expect(roundQueueLine({ text: 'carol: psst', name: 'carol', kind: 5 }, { external: true, inRound: inRound([]) }))
      .toEqual({ text: 'carol: psst', scale: MESSAGE_SCALE, rgb: [r / 128, g / 128, b / 128] });
  });

  it('EXTERNAL WHISPERS off: a whisper from outside the round is dropped; one from a player of the round (case-blind) is drawn', () => {
    const o = { external: false, inRound: inRound(['Kilo', 'Lima']) };
    expect(roundQueueLine({ text: 'carol: psst', name: 'carol', kind: 5 }, o)).toBeNull();
    expect(roundQueueLine({ text: 'kilo: behind you', name: 'kilo', kind: 5 }, o)?.text).toBe('kilo: behind you');
  });

  it('a universe line (kind 1) is drawn in colour 1 whatever EXTERNAL WHISPERS says', () => {
    const [r, g, b] = MESSAGE_COLOURS[1]!;
    expect(roundQueueLine({ text: 'ops: restart soon', name: 'ops', kind: 1 }, { external: false, inRound: inRound([]) }))
      .toEqual({ text: 'ops: restart soon', scale: MESSAGE_SCALE, rgb: [r / 128, g / 128, b / 128] });
  });

  it('the option read from the globals StoreOptions left (FUN_002a41f0), else its initial 1', () => {
    expect(externalWhispers(undefined)).toBe(true);
    expect(externalWhispers(0)).toBe(false);
    expect(externalWhispers(1)).toBe(true);
  });

  it('mounted on a HUD: posts each drawn line once, in order; the dropped one posts nothing', () => {
    const posted: string[] = [];
    let external = false;
    const round = mountRoundChat({
      hud: { postMessage: (lines) => { posted.push(typeof lines === 'string' ? lines : lines.map((l) => l.text).join('/')); } },
      external: () => external, names: () => ['Kilo'],
    });
    round.line({ text: 'carol: psst', name: 'carol', kind: 5 });
    round.line({ text: 'Kilo: here', name: 'Kilo', kind: 5 });
    external = true;
    round.line({ text: 'carol: again', name: 'carol', kind: 5 });
    expect(posted).toEqual(['Kilo: here', 'carol: again']);
  });
});

describe('KEYBOARD-WHISPER: the game state own line (FUN_002f4ba0 -> FUN_001ecc40 D:L51076-51099), not the queue', () => {
  it('posted in its colour whatever EXTERNAL WHISPERS says and whoever is in the round', () => {
    expect(roundQueueLine({ text: 'yo', name: 'watcher', kind: ROUND_LINE_KIND.whisper, own: true }, { external: false, inRound: () => false }))
      .toEqual({ text: 'yo', scale: MESSAGE_SCALE, rgb: MESSAGE_COLOURS[5]!.map((v) => v / 128) });
  });
});

describe('the game session\'s line in the round (FUN_002ba9d0): handed to the game lobby\'s panel, never the HUD', () => {
  it('a room `chat` during the match reaches `gameChat` with its scope, and posts no message', () => {
    let socket: WebSocketLike | null = null;
    const posted: string[] = [];
    const heard: ServerEvent[] = [];
    const hud = new Hud();
    hud.postMessage = ((text: string | { text: string }[]) => { posted.push(typeof text === 'string' ? text : text.map((l) => l.text).join('/')); }) as Hud['postMessage'];
    const walk = {
      setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
      setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
      mode: () => 'walk', feet: () => [0, 0, 0],
    } as unknown as WalkMode;
    const remote = {
      setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined,
      setType: () => undefined, playerType: () => 0, feet: () => [0, 0, 0],
    } as unknown as RemotePlayers;
    const deps: NetPageDeps = {
      walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
      respawned: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
      gameChat: (ev) => { heard.push(ev); },
      socket: () => {
        socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
        return socket;
      },
    };
    new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
    socket!.onopen?.({} as Event);
    const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
    server({
      type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
      players: [{ id: 2, name: 'Mate', team: 'seal' }], rules: 'classic', round: 1, rounds: 11, ghost: false,
    } as unknown as ServerEvent);
    posted.length = 0;
    server({ type: 'chat', sender: 2, name: 'Mate', text: 'push now', team: true });
    server({ type: 'chat', sender: 3, name: 'Foe', text: 'gg' });
    expect(heard).toEqual([{ type: 'chat', sender: 2, name: 'Mate', text: 'push now', team: true }, { type: 'chat', sender: 3, name: 'Foe', text: 'gg' }]);
    expect(posted).toEqual([]);
  });
});
