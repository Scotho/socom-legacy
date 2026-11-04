import type { ArmoryLoadoutProfile, ArmoryLoadoutRecord, MissionRecord } from '@s2u/ui';
import { rowUi, stepItem, type ArmoryContext } from '../../armoryState';
import { pick as pickItem } from '@s2u/scene';
import type { ArmoryData } from '../../armoryData';
import { accountServiceBase } from '../../connectHost';
import { fetchCreateGameOffer } from '../../createGameHost';
import { fetchGameLobbyService, GAME_LOBBY_SESSION_LOST } from '../../gameLobbyHost';
import { launcherState, type LauncherState } from '../../modern/launcherState';
import { SERVER_OFFLINE, SERVER_UNAVAILABLE } from '../../modern/lobbies/data';
import { pageSession, type ModernSession } from '../../modern/session';
import {
  armoryContextOf, chooseColumn, chooseItem, clearedRecord, columnsOf, defaultsOf, kitOf, missionRowsOf, openEditor, recordOf, ROWS,
  slotChoices, storedOf, type EditorState, type MissionRow,
} from '../loadoutModel';
import type {
  LoadoutEditorView, LoadoutListView, LoadoutLock, LoadoutLocked, LoadoutMission, LoadoutOutcome, LoadoutRoller, LoadoutsAdapter, LoadoutSide,
} from '../state';

/**
 * The console's Armory loadouts (CX-LOADOUTS of `docs/plans/2026-10-11-console-launcher.md`; OT.R60 (c)): the account's
 * ARMORY records, mission by mission and side by side, read and edited before any lobby -- DOM-free, drawn by
 * `../render/loadouts` and driven by `../grammar`. It took over the modern Loadouts section (`src/modern/loadout/index.ts`,
 * MU-13f, MU2-4, MU2-8, MU2-10, MU2-12, MU-F2a; retired with this row), its rules ported one for one. A browser
 * adaptation (MU.R1), labelled as one; the original's ARMORY screen and the game lobby's flow are unchanged.
 *
 * - **Its rules are the ARMORY's** (`../loadoutModel`, over `../../armoryState`): which types, which items each slot
 *   offers, the kit a choice leaves, the record saved. Nothing here decides what a loadout may hold.
 * - **Read on demand** (OT.R14): nothing is asked at the making, nor while it is locked -- the records (`GET
 *   /lobby/loadout`), the disc's item names and mission table, and CREATE GAME's offer are read when a list is opened
 *   (`open`) signed in with the disc in and no round running; a mission's world when its editor opens (`edit`).
 * - **Its missions are CREATE GAME's over the server's offer** (`../loadoutModel` `LOADOUT_EDITOR_MISSIONS_ADAPTATION`;
 *   NB-7, OT.R50, OT.R58): `missionRowsOf` over the disc's `missionlist.rdr` (`readMissions`) and the server's `GET /maps`,
 *   read through the page's own `../../createGameHost` `fetchCreateGameOffer` (no request of its own) -- once per session,
 *   again when the session changes (a new sign-in may meet a server restarted with other maps) or on Try again;
 *   never waited on (MU2-4's review F1, as CREATE GAME's `CreateGameOfferRead`): the release's four are listed until it
 *   answers, and its answer relists. A record kept on the account for a map the server does not offer is listed as such
 *   and never opened, dropped or sent: the server would refuse it (400, `checkLoadout`), and the next server may offer it.
 * - **Its world is the disc's (MU.R3)**: the mission's roster, arsenal and `mission.rdr` valves through the launcher's
 *   disc facade (`../../modern/discAssets` `readMissionArmory`, MU2-8: the game lobby's `armoryFromDisc` read, once per
 *   mission per image); the items named as the ARMORY captions them (`readItemNames`; an index the disc names nothing for
 *   is its number). A read begun on an image since replaced is dropped when it settles (MU-F2a, dot's P2).
 * - **Its storage is the server's (MU.R2; OT.R36)**: `GET` / `PUT /lobby/loadout` with `{ mission, side, profile }` and the
 *   session's bearer, through the original page's own transport (`../../gameLobbyHost` `fetchGameLobbyService`, the
 *   request the game lobby's ARMORY sends, `@s2u/ui` `ArmoryProfileCommands` mode 3). No route of its own (MU.R6).
 * - **Its refusals are said**, where the original says nothing (`LOADOUT_SAVE_FAILURE_SILENT_READING`): one wording per
 *   cause and no status number (MU-P1c 18; `SERVER_OFFLINE` for no answer, `SERVER_UNAVAILABLE` for one that fails,
 *   MU-P1d); a 401 ends the session (research 157).
 * - **Locked** signed out, without the disc, and under a running round in the overlay (MU2-10, MU2-12: the round keeps
 *   the disc readers), each with its line (`LOADOUT_LOCK_WORDS`). The round is read live (`follow`, the console's
 *   `roundRunning`), and followed at each draw (`sync`): its beginning drops the mission reads in flight -- the facade's
 *   read takes no signal, so its result is discarded when it settles -- and its end asks the open mission again (the
 *   facade answers from its per-image cache) or reads the records if they never were.
 *
 * Every string from the disc, the server or the page is handed on as data; the screen sets it as text.
 */

export const LOADOUT_EDITOR_ADAPTATION = 'a browser editor over the ARMORY\'s records, not part of the original' as const;

/**
 * MU2-10: the words for the editor under a running round -- the modern UI's own (no original; the design has no "needs
 * ..." line for a round), kept as the owner approved them (H218, 2026-10-14).
 */
export const LOADOUT_ROUND_WORDS = 'Editing a loadout needs the round to end: the ARMORY is read from the disc.';

/**
 * The locked screens' titles and lines. The lines are the retired section's (MU-P1c 17's signed-out shape; MU-8c's disc
 * line; H218's round line); the titles the console's own words for the same states (the Armory items' "Needs disc",
 * Watch's "After the round"). Product-track taste, for the owner's eye.
 */
export const LOADOUT_LOCK_WORDS: Readonly<Record<LoadoutLock, { title: string; line: string }>> = {
  'sign-in': { title: 'Sign in to edit your loadouts', line: 'They are kept on the server for each mission and side.' },
  disc: { title: 'Needs disc', line: 'Insert the disc: the ARMORY\'s types, items and rules are read from it.' },
  round: { title: 'After the round', line: LOADOUT_ROUND_WORDS },
};

/**
 * LOADOUT_ROLLER_PRESS_ADAPTATION: a slot roller's Left / Right is the ARMORY's own press on the row -- the item the
 * fewest presses of that one direction show from the kit as it stands (`../loadoutModel` `slotChoices`' `reach`, the
 * screen's `stepItem` then `pick`, `stepArmory`'s S2), landed by `chooseItem` -- so the roller moves as the screen's row
 * moves, round its scroll order, and a pick the ARMORY locks (the side's C4 lock bit) holds it as the screen does. No
 * item is offered that `slotChoices` does not list. The type roller steps to the next type the map opens, at the ends no
 * further (the retired section's list had no wrap either). A browser adaptation of the input.
 */
export const LOADOUT_ROLLER_PRESS_ADAPTATION = 'a slot roller\'s Left / Right is the ARMORY row\'s own press' as const;

/**
 * The item a roller's press in `way` goes to: the fewest presses of that direction alone that show an item
 * (`slotChoices`' `reach`), else -- a slot of exactly two items, whose one other kit the model's search records under
 * Right only (each kit kept once, its Right tried first; the batch review's F1) -- the row's own one press
 * (`onePress`: `stepItem` then `pick`, the ARMORY's press), taken only when the model offers that item. Null: nothing.
 */
export function pressTarget(
  reach: ReadonlyMap<number, { presses: readonly ('right' | 'left')[] }>, way: 'right' | 'left', onePress: () => number | null,
): number | null {
  let best: { ui: number; n: number } | null = null;
  for (const [ui, r] of reach) if (r.presses.every((p) => p === way) && (!best || r.presses.length < best.n)) best = { ui, n: r.presses.length };
  if (best) return best.ui;
  const ui = onePress();
  return ui !== null && reach.has(ui) ? ui : null;
}

/** The list's line when the server's offer holds no map (the retired section's). */
export const LOADOUT_NO_OFFER_WORDS = 'This server offers no map to keep a loadout for';

const SIDE_LABEL: Record<LoadoutSide, string> = { seal: 'SEALs', terrorist: 'Terrorists' };

/** Why a request failed: the server's status, or none -- `offline` when no answer came at all (fetch's TypeError). */
interface Failure { status: number | null; offline: boolean }
const failureOf = (e: unknown): Failure => {
  const s = (e as { status?: unknown } | null)?.status;
  const status = typeof s === 'number' ? s : null;
  // Realm-safe (the overlay's frame): by name, not `instanceof`. A body not of the shape is an answer that fails.
  return { status, offline: status === null && (e as { name?: unknown } | null)?.name === 'TypeError' };
};

/** The server's refusals of a `PUT` (`loadoutHttp.ts`), in words: one per cause, no number (the retired section's). */
function saveRefusal(f: Failure): string {
  switch (f.status) {
    case 400: return 'The server refused this loadout: not a map or side it offers, or an item it does not list';
    case 409: return 'Your loadout table on the server is full: no new mission can be stored';
    case 413: return 'The loadout was too large for the server';
    case 403: return 'The server refused this request';
    case 415: return 'The server refused the request';
    case 429: return 'Too many saves in a row. Wait a few seconds and save again';
    case 503: return 'The server\'s store is busy. Try again';
    default: return f.offline ? `${SERVER_OFFLINE}. The loadout was not saved` : `${SERVER_UNAVAILABLE}. The loadout was not saved`;
  }
}
/** The records' `GET` refused, in words. */
const readRefusal = (f: Failure): string =>
  f.status === 403 ? 'The server refused this request' : f.offline ? `${SERVER_OFFLINE}.` : `${SERVER_UNAVAILABLE}.`;

const SESSION_ENDED = 'Your session ended. Sign in again';

export interface LoadoutsDeps {
  /** The session (absent: the page's, `../../modern/session` `pageSession`). */
  session?: ModernSession;
  /** The disc's state and its readers (absent: the disc store's, `../../modern/launcherState`). */
  launcher?: LauncherState;
  /** The server's base (absent: `accountServiceBase` over `win`'s address). */
  base?: string;
  /** The window whose address the base is built from (OVERLAY-CONSOLE: the game page's, never the frame's). */
  win?: Window;
  fetchFn?: typeof fetch;
  /** A mission's ARMORY data with its world; absent, the disc facade's (`readMissionArmory`, MU2-8). */
  readMission?: (mission: string) => Promise<ArmoryData | null>;
}

export type LiveLoadouts = LoadoutsAdapter & { dispose(): void };

/** A record's kit as compared for unsaved changes: its type and items, the valid byte aside. */
const kitKey = (p: ArmoryLoadoutProfile): string => JSON.stringify([p.charSet, ...p.items]);

export function liveLoadouts(notify: () => void, deps: LoadoutsDeps = {}): LiveLoadouts {
  const session = deps.session ?? pageSession();
  const launcher = deps.launcher ?? launcherState();
  const base = deps.base ?? (() => {
    const w = deps.win ?? globalThis.window;
    return accountServiceBase(w.location.search, w.location, (import.meta.env as Record<string, unknown> | undefined)?.['DEV'] === true);
  })();
  const transport = fetchGameLobbyService(base, deps.fetchFn ?? ((...a) => fetch(...a)));
  const readMission = deps.readMission ?? (async (mission: string): Promise<ArmoryData | null> => {
    const a = launcher.assets?.() ?? null;
    return a?.readMissionArmory ? a.readMissionArmory(mission) : null;
  });

  let disposed = false, generation = 0;
  /**
   * The disc image's generation: bumped only when the launcher's image changes. A mission read begun on an earlier image
   * is dropped when it settles -- its data and an old failure's null alike -- so it never fills the new image's cache
   * (MU-F2a). Kept apart from `generation`, which a session change also bumps and which must not drop a read of the
   * same image.
   */
  let disc = 0;
  let records: { kind: 'idle' | 'loading' } | { kind: 'ready'; list: ArmoryLoadoutRecord[] } | { kind: 'error'; words: string } = { kind: 'idle' };
  let names: ReadonlyMap<number, string> = new Map();
  /** The disc's mission table as last read (null: none), for the names of the records the server does not offer. */
  let table: readonly MissionRecord[] | null = null;
  /** The missions listed: the release's four until the session's offer and the disc's table are read. */
  let rows: MissionRow[] = missionRowsOf(null, null);
  /** This session's read of CREATE GAME's offer; null: not asked yet. A read a later session or a Try again replaced is dropped. */
  let offer: Promise<number[] | null> | null = null;
  let offered: number[] | null = null;
  let side: LoadoutSide = 'seal';
  /** The mission the editor is open on, or null. */
  let mission: string | null = null;
  /** Whether a loadouts screen is shown (`open` until `sync(false)`): a change of session or disc reads again only then. */
  let active = false;
  const data = new Map<string, Promise<ArmoryData | null>>();
  const read = new Map<string, ArmoryData | null>();
  /** The edits of this visit, by `MISSION:side`, each with the kit it was opened on or last stored (`kitKey`). */
  const editors = new Map<string, { state: EditorState; base: string }>();
  let busy = false;
  let round: () => boolean = () => false;
  let roundWas = false;

  const lock = (): LoadoutLock | null =>
    session.state() !== 'signed-in' || !session.ticket() ? 'sign-in' : (launcher.assets?.() ?? null) === null ? 'disc' : round() ? 'round' : null;
  const locked = (l: LoadoutLock): LoadoutLocked => ({ kind: 'locked', lock: l, ...LOADOUT_LOCK_WORDS[l] });
  const nameOf = (ui: number): string => names.get(ui) ?? `#${ui}`;
  const key = (): string => `${mission}:${side}`;
  const listed = (m: string | null): boolean => m !== null && rows.some((r) => r.mission === m);
  const ctxOf = (): ArmoryContext | null => { const d = mission === null ? null : read.get(mission); return d ? armoryContextOf(d, side) : null; };
  const stored = (): ArmoryLoadoutProfile | null => (records.kind === 'ready' && mission !== null ? storedOf(records.list, mission, side) : null);
  const editorOf = (ctx: ArmoryContext): { state: EditorState; base: string } => {
    let e = editors.get(key());
    if (!e) { const state = openEditor(ctx, stored()); e = { state, base: kitKey(recordOf(ctx, state)) }; editors.set(key(), e); }
    return e;
  };
  const ping = (): void => { if (!disposed) notify(); };

  /**
   * The open mission's world, read off the disc once -- never while locked, the lock read now (MU2-12: a round begun
   * since the last draw lets no ARMORY read through). A read in flight when a round begins is dropped (`sync`).
   */
  function wantMission(): void {
    const m = mission;
    if (m === null || records.kind !== 'ready' || !listed(m) || data.has(m) || lock() !== null) return;
    const image = disc;
    const p = readMission(m).catch(() => null);
    data.set(m, p);
    void p.then((d) => {
      if (image !== disc || data.get(m) !== p) return;   // read off an image since replaced, or dropped by a round
      read.set(m, d);
      ping();
    });
  }

  /** The records, the names and the table read (the offer started with them); nothing while locked. Never notifies at once. */
  async function load(): Promise<void> {
    if (lock() !== null) { records = { kind: 'idle' }; return; }
    const gen = ++generation, ticket = session.ticket()!;
    records = { kind: 'loading' };
    const assets = launcher.assets?.() ?? null;
    askOffer();                                                     // a server is in play now: signed in, the disc in (OT.R14)
    const [list, got, missions] = await Promise.all([
      transport.loadLoadouts!(ticket).catch((e: unknown) => ({ failed: failureOf(e) })),
      assets ? assets.readItemNames().catch(() => new Map<number, string>()) : Promise.resolve(new Map<number, string>()),
      assets?.readMissions ? assets.readMissions().catch(() => null) : Promise.resolve(null),
    ]);
    if (gen !== generation || disposed) return;
    names = got;
    table = missions;
    relist();
    if (list === GAME_LOBBY_SESSION_LOST) { records = { kind: 'error', words: SESSION_ENDED }; ping(); void session.signOut(); return; }
    if (!Array.isArray(list)) { records = { kind: 'error', words: readRefusal(list.failed) }; ping(); return; }
    records = { kind: 'ready', list: list.map((r) => ({ ...r, mission: r.mission.toUpperCase() })) };
    editors.clear();
    wantMission();
    ping();
  }

  /** Starts this session's read of the offer, once; its answer relists, unless a new read replaced it. */
  function askOffer(): void {
    if (offer) return;
    const p = fetchCreateGameOffer(base, deps.fetchFn);
    offer = p;
    void p.then((v) => {
      if (disposed || offer !== p) return;
      offered = v;
      relist();
      wantMission();
      ping();
    });
  }

  function relist(): void { rows = missionRowsOf(table, offered); }

  /** One side's record of the open mission sent (`PUT`); kept in the page's copy once stored. */
  async function send(profile: ArmoryLoadoutProfile, done: string, after: (ok: boolean) => void): Promise<LoadoutOutcome | null> {
    const ticket = session.ticket();
    if (!ticket || records.kind !== 'ready' || mission === null) return null;
    const m = mission, sd = side, gen = generation;
    busy = true;
    let r: unknown;
    try { r = await transport.saveLoadout!(m, sd, profile, ticket); } catch (e) { r = { failed: failureOf(e) }; }
    if (gen !== generation || disposed) return null;
    busy = false;
    if (r === GAME_LOBBY_SESSION_LOST) { void session.signOut(); return { ok: false, words: SESSION_ENDED }; }
    if (r && typeof r === 'object' && 'failed' in r) { after(false); return { ok: false, words: saveRefusal((r as { failed: Failure }).failed) }; }
    const list = records.list.slice();
    const i = list.findIndex((x) => x.mission === m);
    const rec = i >= 0 ? { ...list[i]! } : { mission: m, seal: null, terrorist: null };
    rec[sd] = profile;
    if (i >= 0) list[i] = rec; else list.push(rec);
    records = { kind: 'ready', list };
    after(true);
    return { ok: true, words: done };
  }

  function reset(): void { editors.clear(); busy = false; }

  /** The list of the side open: the missions listed, then the account's records for maps this server does not offer. */
  function list(): LoadoutListView {
    const l = lock();
    if (l) return locked(l);
    if (records.kind === 'error') return { kind: 'failed', words: records.words };
    if (records.kind !== 'ready') return { kind: 'loading' };
    const all = records.list;
    const out: LoadoutMission[] = rows.map((r): LoadoutMission => ({ mission: r.mission, name: r.name, state: storedOf(all, r.mission, side)?.valid ? 'saved' : 'default' }));
    const shown = new Set(rows.map((r) => r.mission));
    for (const r of all) {
      if (shown.has(r.mission) || !r[side]?.valid) continue;
      const n = Number(r.mission.slice(2));
      out.push({ mission: r.mission, name: table?.find((x) => x.number === n)?.name ?? r.mission, state: 'unoffered' });
    }
    return { kind: 'ok', rows: out, empty: rows.length === 0 ? LOADOUT_NO_OFFER_WORDS : null };
  }

  function editor(): LoadoutEditorView {
    const l = lock();
    if (l) return locked(l);
    if (records.kind === 'error') return { kind: 'failed', words: records.words };
    if (records.kind !== 'ready') return { kind: 'loading' };
    if (mission === null || !listed(mission)) return { kind: 'gone' };
    if (!read.has(mission)) return { kind: 'loading' };
    const ctx = ctxOf();
    if (!ctx) return { kind: 'failed', words: `The ARMORY of ${mission} could not be read from the disc` };
    const e = editorOf(ctx), s = e.state, col = s.committed ?? s.column;
    const title = read.get(mission)?.roster?.missionTitle;
    const p = stored();
    const cols = columnsOf(ctx);
    const type: LoadoutRoller = {
      label: 'Character type', values: cols.map((c) => (c.open ? `Type ${c.column + 1}` : `Type ${c.column + 1} · locked on this map`)),
      at: Math.max(0, cols.findIndex((c) => c.column === col)), open: cols.map((c) => c.open), fixed: null,
    };
    const kit = kitOf(s);
    const slots = ROWS.map((r): LoadoutRoller => {
      const c = slotChoices(ctx, kit, r.row);
      const fixed = c.fixed === 'locked' ? 'Locked: the ARMORY does not let this slot change' : c.fixed === 'skipped' ? 'Taken by the item before it' : null;
      return { label: r.label, values: c.options.map(nameOf), at: Math.max(0, c.options.indexOf(c.current)), open: c.options.map(() => fixed === null), fixed };
    });
    return {
      kind: 'ok', mission, name: rows.find((r) => r.mission === mission)?.name ?? mission,
      head: title ? `${mission} · ${title} · ${SIDE_LABEL[side]}` : `${mission} · ${SIDE_LABEL[side]}`,
      held: p?.valid ? `Stored on the server: type ${p.charSet - (side === 'terrorist' ? 4 : 0)}` : 'Nothing stored for this mission and side: the type\'s own kit',
      rows: [type, ...slots], busy, dirty: kitKey(recordOf(ctx, s)) !== e.base,
    };
  }

  /** The editor's state, when it is open and drawn (not locked, not busy). */
  const editing = (): { ctx: ArmoryContext; e: { state: EditorState; base: string } } | null => {
    if (busy || editor().kind !== 'ok') return null;
    const ctx = ctxOf();
    return ctx ? { ctx, e: editorOf(ctx) } : null;
  };

  const offSession = session.onChange(() => {
    generation++; reset(); offer = null; offered = null; records = { kind: 'idle' };
    if (active) void load();
    ping();
  });
  const offDisc = launcher.onChange(() => {
    generation++; disc++; data.clear(); read.clear(); reset(); records = { kind: 'idle' };
    if (active) void load();
    ping();
  });

  return {
    open(sd: LoadoutSide): void {
      side = sd;
      active = true;
      if (records.kind === 'idle' || records.kind === 'error') void load();
    },
    list,
    retry(): void { offer = null; void load(); },                // the offer asked again; the last answer stands meanwhile
    edit(m: string): void { mission = m; wantMission(); },
    editor,
    step(row: number, d: -1 | 1): void {
      const at = editing();
      if (!at) return;
      const { ctx, e } = at;
      if (row === 0) {
        const cols = columnsOf(ctx), col = e.state.committed ?? e.state.column;
        for (let c = col + d; c >= 0 && c < cols.length; c += d) {
          if (cols[c]!.open) { e.state = chooseColumn(ctx, e.state, c); return; }
        }
        return;
      }
      // LOADOUT_ROLLER_PRESS_ADAPTATION: the item the fewest presses of this direction alone show (`pressTarget`).
      const kit = kitOf(e.state);
      const c = slotChoices(ctx, kit, row);
      if (c.fixed !== null) return;
      const onePress = (): number | null => {
        const id = stepItem(ctx, kit, row, d);
        return id === null ? null : rowUi(pickItem(ctx.arsenal, ctx.valves, ctx.side, kit, row - 1, id).loadout, row);
      };
      const ui = pressTarget(c.reach, d > 0 ? 'right' : 'left', onePress);
      if (ui !== null) e.state = chooseItem(ctx, e.state, row, ui);
    },
    save(): Promise<LoadoutOutcome | null> | null {
      const at = editing();
      if (!at) return null;
      const profile = recordOf(at.ctx, at.e.state);
      const e = at.e;
      return send(profile, `Saved: ${mission} · ${SIDE_LABEL[side]}`, (ok) => { if (ok) e.base = kitKey(profile); });
    },
    defaults(): Promise<LoadoutOutcome | null> | null {
      const at = editing();
      if (!at) return null;
      const { ctx, e } = at;
      e.state = defaultsOf(ctx, e.state);
      const cleared = clearedRecord(stored());
      if (!cleared) return Promise.resolve({ ok: true, words: 'Defaults: the type\'s own kit' });
      const now = kitKey(recordOf(ctx, e.state));
      return send(cleared, `Defaults: the stored loadout for ${mission} · ${SIDE_LABEL[side]} is cleared`, (ok) => { if (ok) e.base = now; });
    },
    close(): void { if (mission !== null) editors.delete(key()); mission = null; },
    follow(r: () => boolean): void { round = r; roundWas = r(); },
    sync(shown: boolean): void {
      const now = round();
      if (now !== roundWas) {
        roundWas = now;
        // MU2-12: the round's beginning drops the reads not yet settled (their results discarded); its end asks the open
        // mission again, or reads the records if they never were.
        if (now) { for (const m of [...data.keys()]) if (!read.has(m)) data.delete(m); }
        else if (active) { if (records.kind === 'ready') wantMission(); else void load(); }
      }
      if (!shown && active) { active = false; if (mission !== null) editors.delete(key()); mission = null; }
    },
    dispose(): void { disposed = true; generation++; offSession(); offDisc(); },
  };
}
