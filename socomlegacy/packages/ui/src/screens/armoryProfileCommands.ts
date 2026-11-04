import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import { VALVE_TYPE, type ValveStore } from '../valves';
import type { ZAnimUiCommand } from '../zanimRuntime';

/**
 * The ARMORY's saved loadouts online (ONL-17 on SVC-24; OT.R36, the owner: "loadouts saved server side"; web research
 * 167): the two rows the online flow calls -- `CharacterProfile` (186, `FUN_00275770` D:L121919-122131) and
 * `InitializeOnlineArmory` (208, `FUN_0027d8c0` D:L126092-126102) -- over the account's records on our server
 * (`GET` / `PUT /lobby/loadout`, `packages/central/src/loadoutHttp.ts`). `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`. Transcribed, cited, never pasted; reading, pending review.
 *
 * `CharacterProfile`'s mode is the command's byte +0x10 (research 95 §4.4; on the disc: `FromBriefing`,
 * `switch_teams_anim` and `SwapClanSides` call 2 and 0, `StoringLoadout` 1, `SaveCharacterProfile` 3 and 4,
 * `returnto_Defaults` 7, `dlgNetConnect`'s `DownloadCharacterProfile` 5 and 6):
 *
 * | mode | the original (D:L) | here |
 * |---|---|---|
 * | 0 | the record found (valid) is written into `MpCharSet`, `primsel` .. `equip3sel` through their watchers (122051-122128) | the same, from the page's copy of the account's records |
 * | 1 | the record built from those six valves, kept valid (122039-122050, `FUN_002fb610`) | the same, in the page's copy; the upload is mode 3's |
 * | 2 | 1 when a valid record exists (122026-122033) | the same |
 * | 3 | the file built and its upload started; 1 (122021-122024, `FUN_0033eb70`) | the record `PUT` (`LOADOUT_HTTP_ADAPTATION`); 1 |
 * | 4 | 1 once no request is pending (122016-122019, `FUN_0033e7f0`) | 1 once the `PUT` is settled |
 * | 5 | the download started (122012-122014, `FUN_0033ea10`) | the `GET`; 1 |
 * | 6 | its completion (122008-122010, `FUN_0033e850`) | 1 once the `GET` is settled |
 * | 7 | the record's valid byte cleared (122001-122006) | the same, in the page's copy; uploaded by the 3 / 4 that follow |
 *
 * The record's key is the account (the original's `LOBBY_HOST`, `LOBBY_PORT`, `PLAYERNAMEVAR`: the server's bearer),
 * the mission (`LOADOUT_MISSION_READING`) and the side: `player_team` 0 the SEALs, 8 the terrorists; a spectator has
 * none (`FUN_002fb470` with side 2 answers none, D:L198763). Pure: no DOM, no viewer, no `tools/`.
 */

/** A side's record (`FUN_002fb610`): `MpCharSet`, the five UI indices, valid. The viewer's `ArmoryProfile`. */
export interface ArmoryLoadoutProfile { charSet: number; items: [number, number, number, number, number]; valid: boolean }
export type ArmoryLoadoutSide = 'seal' | 'terrorist';
/** One mission's records, as SVC-24 answers them. */
export interface ArmoryLoadoutRecord { mission: string; seal: ArmoryLoadoutProfile | null; terrorist: ArmoryLoadoutProfile | null }

/** SVC-24 as the page reaches it (`packages/viewer/src/gameLobbyHost.ts`): a rejection is a request failed or refused. */
export interface ArmoryLoadoutService {
  load(): Promise<readonly ArmoryLoadoutRecord[]>;
  /** Rejected when not stored; a refusal the server answered carries its HTTP `status` (`LOADOUT_LASTING_REFUSAL`). */
  save(mission: string, side: ArmoryLoadoutSide, profile: ArmoryLoadoutProfile): Promise<void>;
}

/**
 * LOW-5 (web research 223 s6): the `PUT`'s refusal that lasts -- 409, the account's mission table full (SVC-24's
 * `LOADOUT_MISSIONS_MAX`, `packages/central/src/serviceStore.ts`; `loadoutHttp.ts` answers it 409): the server takes no new mission until the table
 * changes, so the record leaves `dirty` (kept in the page's copy, not resent on every save and ARMORY entry). A 429,
 * any other status and a network failure stay dirty. A server adaptation (the original's store has no such table).
 */
export const LOADOUT_LASTING_REFUSAL = 409;
const lasting = (e: unknown): boolean => (e as { status?: unknown } | null)?.status === LOADOUT_LASTING_REFUSAL;

/** The valves mode 0 writes and mode 1 reads (S:0x3ee9f8 .. S:0x3eea38, D:L121977-121982), in the record's order. */
export const PROFILE_VALVES = ['MpCharSet', 'primsel', 'secsel', 'equip1sel', 'equip2sel', 'equip3sel'] as const;

/**
 * LOADOUT_MISSION_READING: the record's mission is the 8-byte name at 0x414e00 that `UISetMission` writes (0x27eb50,
 * D:L126655-126680); in the game lobby the mission is the game's -- the play list's first, "mp<n>" (`FUN_0027f810`,
 * `GameLobbyCommands.missionName`) -- and the page keys by it upper-cased (the original compares case-insensitively,
 * `FUN_00198b80`). Which writer of 0x414e00 runs between the lobby's entry and the ARMORY is not traced. [reading]
 */
export const LOADOUT_MISSION_READING = 'the game lobby\'s mission, upper-cased' as const;

/**
 * LOADOUT_SAVE_FAILURE_SILENT_READING: the original shows nothing when the upload fails -- mode 4 waits only for the
 * request queue to empty (`FUN_0033e7f0`), `SaveCharacterProfile`'s second sequence stops it after 3 s, and
 * `StoringLoadout` then kills its popup and gives the input back; the record stays in the console's account database
 * (mode 1 kept it). So a refused or failed `PUT` ends mode 4 as a settled one does, no dialog, the record kept in the
 * page's copy for the session (`saveFailures` counts them). Every refused record is kept (`dirty`, NET-STORE) and sent
 * again with the next store and at the ARMORY's next entry, and no load replaces it with the server's older copy -- but
 * a lasting refusal, a 409 (`LOADOUT_LASTING_REFUSAL`, LOW-5), which is not sent again until the record changes. A 401
 * is the session's end (`sessionLost`, research 157), the page's service's to tell. [reading]
 */
export const LOADOUT_SAVE_FAILURE_SILENT_READING = 'no dialog: mode 4 ends, the record kept in the page\'s copy' as const;

/**
 * CHARACTER_PROFILE_BUSY_READING: modes 0, 1, 2 and 7 act only while `FUN_003045b0(0x44fe10)` answers 0
 * (D:L122002, D:L122027, D:L122040, D:L122051); the object at 0x44fe10 is not read. Taken as never busy. [reading]
 */
export const CHARACTER_PROFILE_BUSY_READING = 'FUN_003045b0(0x44fe10) taken as 0' as const;

/**
 * LOADOUT_REFRESH_AT_ARMORY_ADAPTATION: the original downloads the records once, at the login (`dlgNetConnect`'s
 * `DownloadCharacterProfile`, modes 5 and 6); `InitializeOnlineArmory` itself touches only the voice object
 * (`FUN_0030e6e0`, `FUN_0030e490`; `ARMORY_INIT_VOICE_READING`, research 95). Here the ARMORY's entry also asks the
 * server again, so a record stored from another page of the same account is the one shown -- unless this page holds a
 * record of that mission and side the server does not have yet (on its way or refused: `dirty`), which it keeps and
 * sends again. A browser adaptation: what the screens show is the original's.
 */
export const LOADOUT_REFRESH_AT_ARMORY_ADAPTATION = 'InitializeOnlineArmory also asks the server for the records' as const;

export interface ArmoryProfileOptions {
  valves: () => ValveStore;
  /** The record's mission (`LOADOUT_MISSION_READING`); '' with none. */
  mission: () => string;
  /** SVC-24; absent, the copy is the page's alone (nothing loaded, nothing saved). */
  service?: ArmoryLoadoutService;
  log?: (name: 'CharacterProfile' | 'InitializeOnlineArmory', mode: number, answer: boolean) => void;
}

const teamSide = (team: number): ArmoryLoadoutSide | null => (team === 0 ? 'seal' : team === 8 ? 'terrorist' : null);

export class ArmoryProfileCommands {
  /** The account's records by mission (upper case): the page's copy of the console's account database. */
  private records = new Map<string, ArmoryLoadoutRecord>();
  /** The record mode 1 or 7 last touched: what mode 3 uploads. */
  private touched: { mission: string; side: ArmoryLoadoutSide } | null = null;
  /**
   * The records the server does not hold yet, by `MISSION:side` (NET-STORE, research 223 §5.3): every record mode 1 or 7
   * writes, until a `PUT` of that very record is answered. Mode 3 sends them all (the original uploads the whole
   * profile file, every record, `FUN_0033eb70`), the touched one first; the ARMORY's entry sends them again; a load
   * never replaces one with the server's older copy. So a save the server refused (a 429 past the account's write
   * allowance, a 500) is kept on the page and reaches the server with a later save, without a dialog.
   */
  private readonly dirty = new Map<string, { mission: string; side: ArmoryLoadoutSide }>();
  private loads = 0;
  private saves = 0;
  /** Saves refused or failed (`LOADOUT_SAVE_FAILURE_SILENT_READING`). */
  saveFailures = 0;

  constructor(private readonly o: ArmoryProfileOptions) {}

  private valve(name: string): number { return this.o.valves().acquire(name, VALVE_TYPE.PERM).value; }
  private setValve(name: string, value: number): void {
    const v = this.o.valves();
    v.acquire(name, VALVE_TYPE.PERM);
    v.set(name, value, VALVE_TYPE.PERM);
  }
  private key(): { mission: string; side: ArmoryLoadoutSide } | null {
    const mission = this.o.mission().toUpperCase(), side = teamSide(this.valve('player_team'));
    return mission === '' || side === null ? null : { mission, side };
  }
  /** The valid record of the current mission and side (`FUN_002fb470`), or null. */
  record(): ArmoryLoadoutProfile | null {
    const k = this.key();
    const p = k ? this.records.get(k.mission)?.[k.side] ?? null : null;
    return p?.valid ? p : null;
  }
  private put(k: { mission: string; side: ArmoryLoadoutSide }, p: ArmoryLoadoutProfile): void {
    const r = this.records.get(k.mission) ?? { mission: k.mission, seal: null, terrorist: null };
    r[k.side] = p;
    this.records.set(k.mission, r);
    this.touched = k;
    this.dirty.set(`${k.mission}:${k.side}`, { mission: k.mission, side: k.side });
  }

  /**
   * The `GET` (modes 5, and `InitializeOnlineArmory`): the copy replaced by the server's records, except every record the
   * server does not hold yet (`dirty`: unsent, on its way, or refused), which the page keeps.
   */
  load(): void {
    const svc = this.o.service;
    if (!svc) return;
    this.loads++;
    svc.load().then((list) => {
      const next = new Map(list.map((r) => [r.mission.toUpperCase(), structuredClone(r)]));
      for (const { mission, side } of this.dirty.values()) {
        const mine = this.records.get(mission)?.[side] ?? null;
        const r = next.get(mission) ?? { mission, seal: null, terrorist: null };
        r[side] = mine === null ? null : structuredClone(mine);
        next.set(mission, r);
      }
      this.records = next;
    }, () => { /* never answered or refused: the copy stands */ }).finally(() => { this.loads--; });
  }

  /** Sends every dirty record, the touched one first; each leaves `dirty` once a `PUT` of it as it still stands is answered. */
  private save(): void {
    const svc = this.o.service;
    if (!svc) return;
    const t = this.touched ? `${this.touched.mission}:${this.touched.side}` : null;
    const keys = [...this.dirty.keys()].sort((a, b) => Number(b === t) - Number(a === t));
    for (const key of keys) {
      const { mission, side } = this.dirty.get(key)!;
      const p = this.records.get(mission)?.[side];
      if (!p) { this.dirty.delete(key); continue; }
      const sent = structuredClone(p);
      this.saves++;
      svc.save(mission, side, sent).then(() => {
        const now = this.records.get(mission)?.[side];
        if (now && JSON.stringify(now) === JSON.stringify(sent)) this.dirty.delete(key);
      }, (e: unknown) => {
        this.saveFailures++;
        // LOW-5: a lasting refusal (409) of the record as it still stands is not sent again.
        const now = this.records.get(mission)?.[side];
        if (lasting(e) && now && JSON.stringify(now) === JSON.stringify(sent)) this.dirty.delete(key);
      }).finally(() => { this.saves--; });
    }
  }

  /** Whether a `GET` or a `PUT` is on its way. */
  pending(): { loading: boolean; saving: boolean } { return { loading: this.loads > 0, saving: this.saves > 0 }; }

  /** `FUN_00275770`: the mode at +0x10 (the table above). */
  CharacterProfile: UiCommandHandler = (cmd: ZAnimUiCommand) => this.mode(cmd.bytes[0x10] ?? 0);

  /**
   * The row's body for one mode (the table above), without a command: what the shared ARMORY on the game lobby's page
   * (`packages/viewer/src/lobbyArmory.ts`) calls where the disc's `StoringLoadout` (1, then `SaveCharacterProfile`'s 3)
   * and `returnto_Defaults` (7, then 3) call the row.
   */
  mode(mode: number): boolean {
    const answer = (a: boolean): boolean => { this.o.log?.('CharacterProfile', mode, a); return a; };
    const k = this.key();
    switch (mode) {
      case 0: {
        const p = this.record();
        if (p) [p.charSet, ...p.items].forEach((v, i) => { if (this.valve(PROFILE_VALVES[i]!) !== v) this.setValve(PROFILE_VALVES[i]!, v); });
        return answer(true);
      }
      case 1:
        if (k) this.put(k, { charSet: this.valve('MpCharSet') & 0xff, items: PROFILE_VALVES.slice(1).map((n) => this.valve(n) & 0xffff) as ArmoryLoadoutProfile['items'], valid: true });
        return answer(true);
      case 2: return answer(this.record() !== null);
      case 3: this.save(); return answer(true);
      case 4: return answer(this.saves === 0);
      case 5: this.load(); return answer(true);
      case 6: return answer(this.loads === 0);
      case 7: {
        const p = this.record();
        if (k && p) this.put(k, { ...p, valid: false });
        return answer(true);
      }
      default: return answer(true);
    }
  }

  /** `FUN_0027d8c0` (D:L126092-126102): the voice object's reset (`ARMORY_INIT_VOICE_READING`); 1. Here also the records asked again (`LOADOUT_REFRESH_AT_ARMORY_ADAPTATION`). */
  InitializeOnlineArmory: UiCommandHandler = () => {
    this.load();
    if (this.dirty.size > 0) this.save(); // a refused save goes up again at the ARMORY's entry (`dirty`)
    this.o.log?.('InitializeOnlineArmory', 0, true);
    return true;
  };

  register(host: UiCommandHost): void {
    host.setHandler('CharacterProfile', this.CharacterProfile);
    host.setHandler('InitializeOnlineArmory', this.InitializeOnlineArmory);
  }
}
