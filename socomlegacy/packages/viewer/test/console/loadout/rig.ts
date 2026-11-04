import { vi } from 'vitest';
import type { MissionRecord } from '@s2u/ui';
import type { DiscAssets } from '../../../src/modern/discAssets';
import type { LauncherSnapshot, LauncherState } from '../../../src/modern/launcherState';
import type { ModernSession, SessionSnapshot, SessionState } from '../../../src/modern/session';

/**
 * MU2-4: the loadout editor's test rig -- a session, a launcher with the disc's readers, and a server that answers the
 * editor's three routes (`GET /maps` -- CREATE GAME's offer, NB-7 -- and `GET` / `PUT /lobby/loadout`), each answer the
 * test's to set. Test doubles only: nothing here is a rule.
 */
export const BASE = 'https://lobby.test';
export const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

export type Session = ModernSession & { signOut: ReturnType<typeof vi.fn>; set(s: SessionState): void };
export function session(state: SessionState = 'signed-in'): Session {
  let now = state; const subs = new Set<(s: SessionSnapshot) => void>();
  const signOut = vi.fn(async () => { now = 'signed-out'; for (const cb of [...subs]) cb({ state: now, account: null, error: null }); });
  return {
    state: () => now, account: () => (now === 'signed-in' ? { name: 'Hawk' } : null), ticket: () => (now === 'signed-in' ? 'tk' : null), error: () => null,
    remembers: () => false, onChange: (cb) => { subs.add(cb); return () => subs.delete(cb); }, signIn: async () => ({ ok: true }),
    create: async () => ({ ok: true }), signOut, close: () => {},
    set(s) { now = s; for (const cb of [...subs]) cb({ state: s, account: null, error: null }); },
  };
}

/**
 * Part of the disc's `missionlist.rdr` as `createGameCommands.test.ts` (packages/ui) holds it: its order (the game's
 * mission table, `FUN_002c9540`), names and types; 99 a mission not flagged multiplayer.
 */
export const TABLE: readonly MissionRecord[] = [
  { number: 51, name: 'VIGILANCE', type: 5, multiplayer: true }, { number: 52, name: 'THE MIXER', type: 3, multiplayer: true },
  { number: 53, name: 'FOXHUNT', type: 3, multiplayer: true }, { number: 72, name: 'CROSSROADS', type: 2, multiplayer: true },
  { number: 2, name: 'FROSTFIRE', type: 5, multiplayer: true }, { number: 6, name: 'DESERT GLORY', type: 4, multiplayer: true },
  { number: 7, name: 'NIGHT STALKER', type: 2, multiplayer: true }, { number: 99, name: 'SINGLE', type: 0, multiplayer: false },
];
export const NAMES = new Map([[1, 'M16A2'], [3, '<b>HK5</b>'], [18, 'M4A1'], [75, 'MK23'], [36, 'FRAG'], [37, 'HE'], [35, '2X AMMO'], [49, 'SMOKE']]);

export type Launcher = LauncherState & { set(d: LauncherSnapshot['disc']): void; names: ReturnType<typeof vi.fn>; missions: ReturnType<typeof vi.fn> };
/** A launcher whose image reads `missions` (absent: TABLE; null: a reader with no table, an older fake). */
export function launcherWith(disc: LauncherSnapshot['disc'] = 'ready', o: { missions?: (() => Promise<readonly MissionRecord[]>) | null } = {}): Launcher {
  let now = disc; const subs = new Set<(s: LauncherSnapshot) => void>();
  const names = vi.fn(async () => NAMES);
  const missions = vi.fn(o.missions ?? (async () => TABLE));
  const assets: DiscAssets = { readValveDefaults: async () => [], readItemNames: names, ...(o.missions === null ? {} : { readMissions: missions }) };
  return {
    disc: () => now, isoInserted: () => now === 'ready', filename: () => null, assets: () => (now === 'ready' ? assets : null),
    onChange: (cb) => { subs.add(cb); return () => subs.delete(cb); },
    set(d) { now = d; for (const cb of [...subs]) cb({ disc: d, isoInserted: d === 'ready', filename: null }); }, names, missions,
  };
}

export interface Call { url: string; init: RequestInit }
type Answer = () => Response | Promise<Response>;
export const json = (v: unknown, status = 200): Answer => () => new Response(JSON.stringify(v), { status });
export const served = (...maps: string[]): Answer => json({ maps, offer: 'served' });
/** MAPS-4's answer from a server before the served rule (NB-7's `release`; LATER 66 retired the setting): the maps, no `offer`. */
export const release = (...maps: string[]): Answer => json({ maps });

/** The server: `/maps` (absent: the release's answer), the records' GET, the PUT's status (or an answer). Every answer may be changed between calls. */
export function server(o: { maps?: Answer; records?: unknown[]; get?: Answer; put?: number | Answer } = {}): { fetchFn: typeof fetch; calls: Call[]; set(p: Partial<typeof o>): void } {
  const calls: Call[] = [];
  const now = { ...o };
  const fetchFn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    const path = String(input).replace(BASE, '');
    const method = init.method ?? 'GET';
    if (path === '/maps') return (now.maps ?? release('MP2', 'MP7', 'MP51', 'MP72'))();
    if (path === '/lobby/loadout' && method === 'GET') return (now.get ?? json({ loadouts: now.records ?? [] }))();
    if (path === '/lobby/loadout' && method === 'PUT') {
      const p = now.put ?? 200;
      if (typeof p === 'function') return p();
      return new Response(p === 200 ? JSON.stringify({ status: 0 }) : null, { status: p });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  return { fetchFn, calls, set(p) { Object.assign(now, p); } };
}
export const mapsCalls = (calls: readonly Call[]): Call[] => calls.filter((c) => c.url === `${BASE}/maps`);
