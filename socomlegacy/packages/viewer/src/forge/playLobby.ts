import type { ArmoryData } from '../armoryData';
import type { ArmoryExit } from '../armoryState';
import { mountForgeLobby, type ForgeLobby } from './lobby/lobby';
import type { ArmoryPaint } from './lobby/lobbyArmory';
import type { ForgeLobbyChatLine, ForgeLobbyDeps, GameLobbyEvent } from './lobby/deps';
import type { PadSnapshot } from './pad';

/**
 * The Play settings' Start: Simulate Lobby (the owner, 2026-11-25: "I don't want to spawn in a match with the armory ui, I
 * want to spawn in a lobby so that I can browse the menus and see the armory and weapon list"; a browser adaptation --
 * the original's lobby is the server's): the Forge's lobby window (`./lobby/lobby`, the online lobby's own) over a
 * room of this page's alone. Its seats are the player's; SWITCH TEAMS turns the side, READY marks it, the ARMORY opens
 * on the layout's arsenal and characters (`armory`), and LAUNCH starts Play with the side, the type and the kit chosen
 * (`PlayLobbyChoice`); LEAVE or the window's close starts nothing. Nothing goes to a server and nothing is stored.
 */
export interface PlayLobbyChoice {
  /** The side, or null for a watcher's seat (the Play settings' Spectator). */
  side: 'seal' | 'terrorist' | null;
  /** The ARMORY's type and kit, where it was opened; absent, the room's defaults. */
  kit?: { type: number; picks: { slot: number; id: number }[] };
}

export interface PlayLobbyOptions {
  doc: Document;
  /** The lobby's name and the map's stem, for the header and the ARMORY's world key. */
  name: string;
  map: string;
  players: number;
  /** The side the Play settings would take; null, a watcher's seat (Spectator: no side, no ARMORY, no SWITCH SIDES). */
  side: 'seal' | 'terrorist' | null;
  /** The player's name on the seat. */
  player: string;
  /** The layout's NPCs, a bot seat each (its words and side): the match seats them so. */
  npcs: readonly { name: string; team: 'seal' | 'terrorist' }[];
  /** The ARMORY's data for the map (`./match` `lobbyArmoryData`), or null where the map has no arsenal. */
  armory(): Promise<ArmoryData> | null;
  paint: ArmoryPaint | null;
}

export interface PlayLobby {
  /** The choice made: LAUNCH's, or null for LEAVE and the close. */
  readonly done: Promise<PlayLobbyChoice | null>;
  frame(dt: number): void;
  pad(snap: PadSnapshot | null): void;
  /** Taken down (the page left Play's start), resolving `done` with null when it has not been. */
  dispose(): void;
}

const ME = 1;

export function openPlayLobby(o: PlayLobbyOptions): PlayLobby {
  let side = o.side;
  let ready = false;
  const kits = new Map<'seal' | 'terrorist', ArmoryExit>();
  const sides = ['seal', 'terrorist'] as const;
  const lobbyCbs = new Set<(ev: GameLobbyEvent) => void>();
  const chatCbs = new Set<(line: ForgeLobbyChatLine) => void>();
  let finish!: (c: PlayLobbyChoice | null) => void;
  let settled = false;
  const done = new Promise<PlayLobbyChoice | null>((resolve) => { finish = (c) => { if (settled) return; settled = true; resolve(c); }; });
  const view = (): GameLobbyEvent => ({
    type: 'gameLobby', countdown: null, launched: false,
    seats: [
      { id: ME, name: o.player, team: side, ready, host: true, readyIn: 0 },
      ...o.npcs.map((n, i) => ({ id: ME + 1 + i, name: n.name, team: n.team, ready: true, host: false, readyIn: 0, bot: true as const })),
      // LAUNCH asks both sides seated (`./lobby/lobbyView`): a side nobody plays is shown as an empty seat, as Play has it.
      ...sides.filter((t) => t !== side && !o.npcs.some((n) => n.team === t))
        .map((t, i) => ({ id: 990 + i, name: 'Empty side', team: t, ready: true, host: false, readyIn: 0, bot: true as const })),
    ],
  });
  const tell = (): void => { const v = view(); for (const cb of lobbyCbs) cb(v); };
  let popup: ForgeLobby | null = null;
  const choice = (): PlayLobbyChoice => {
    const k = side ? kits.get(side) : undefined;
    return { side, ...(k ? { kit: { type: k.type, picks: k.picks.map((p) => ({ slot: p.slot, id: p.id })) } } : {}) };
  };
  const deps: ForgeLobbyDeps = {
    doc: o.doc,
    net: () => null,
    lobby: () => view(),
    onLobby: (cb) => { lobbyCbs.add(cb); return () => { lobbyCbs.delete(cb); }; },
    onChat: (cb) => { chatCbs.add(cb); return () => { chatCbs.delete(cb); }; },
    me: () => ({ id: ME, host: true }),
    title: () => ({ name: o.name, map: o.map, players: o.players }),
    send: (ev) => {
      if (ev === 'switchTeams') { if (side) { side = side === 'seal' ? 'terrorist' : 'seal'; ready = false; tell(); } }
      else if (ev === 'lobbyReady') { ready = !ready; tell(); }
      else if (ev === 'launch') { finish(choice()); }
    },
    chat: (text, team) => { for (const cb of chatCbs) cb({ from: o.player, text, team }); },
    armory: () => {
      const data = side ? o.armory() : null;                 // a watcher has no ARMORY
      const s = side;
      return data && s ? { data, side: s, send: (exit: ArmoryExit) => { kits.set(s, exit); } } : null;
    },
    close: () => { finish(null); },
  };
  popup = mountForgeLobby(o.doc.body, deps, { paint: o.paint });
  // The ARMORY's keys (`ForgeLobby.key`): every key it takes is its, none reaching the editor behind.
  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || !popup) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (popup.screen() !== 'armory') return;
    if (!e.repeat) popup.key(e.code);
    if (e.code !== 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  o.doc.addEventListener('keydown', onKey, true);
  popup.notice('Simulate Lobby: the lobby’s screens on this page only, no real match. SWITCH SIDES picks your side, ARMORY your character and kit, LAUNCH starts Play');
  void done.then(() => { o.doc.removeEventListener('keydown', onKey, true); popup?.dispose(); popup = null; });
  return {
    done,
    frame: (dt) => { popup?.frame(dt); },
    pad: (snap) => { popup?.pad(snap); },
    dispose: () => { finish(null); },
  };
}
