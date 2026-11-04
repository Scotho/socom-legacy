import type { UiCommandHandler, UiCommandHost } from '../uiCommands';
import type { UiVarManager, UiVarValue } from '../uiVars';
import type { ZAnimUiCommand } from '../zanimRuntime';
import type { DnasEntryCommand } from './dnasCommands';

/**
 * USER AGREEMENT's data (`dlgUsagePolicy.rdr`, ONL-08; web research 156 §1, on research 128 §4.6 and 133): the policy
 * request `GetUsagePolicy` sends, the reply handler that fills the UI variable `usage_policy` shows, and the stub of
 * DECLINE's `LobbyLogout` (ONL-10's body). PLAT-08's `UiCommandHost` is a registry each module fills (`setHandler`,
 * W9.R4); the table is not edited.
 *
 * **The request.** `GetUsagePolicy` (`FUN_002797c0` D:L123946-123953) calls `FUN_002f79f0(0x44f370)`
 * (D:L196630-196652): only while the lobby session's flag +0x7d is set (`FUN_002e0030` sets it, D:L182633-182634,
 * reached from `LobbyConnect` `FUN_00276780` D:L122535; `FUN_002df650` / `FUN_002e0630` clear it), it adds UsagePolicy
 * (0x3f5828) at longevity 1 and sets it to "Retrieving Usage Policy....." (0x3f5840), adds TempUsagePolicy (0x3f5860)
 * at 1 and sets it to " " (0x3f5870), and sends the 0x2c-byte request -- the session key (0x66a4d0, 17 bytes) at +0x15,
 * the policy type 0 (Usage) at +0x28 -- through `FUN_006495e0` with the callback `FUN_002f7ac0`. The answer is 1.
 *
 * **The reply** (`FUN_002f7ac0` D:L196655-196712): a non-success status (`FUN_002f42d0` "GetPolicyRequest": status ==
 * 0) does nothing. A success builds an array -- every string element of TempUsagePolicy when it is an array, then the
 * reply's policy (+0x1c) -- and sets it into TempUsagePolicy while EndOfText (+0x11c) is clear, into UsagePolicy when
 * it is set. The first chunk finds TempUsagePolicy the string " ", not an array, so the text starts at the first chunk.
 *
 * The replies arrive through the page's service (`UsagePolicyService`: SVC-05's `POST /texts/policy` on the match
 * server, `packages/central/src/serverTexts.ts`, which answers `{ chunks }` in 255-byte pieces). The text is the
 * server's: the placeholder until the owner writes his (OT.R17; HUMAN_TASKS H73).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** The rows: index in the table, id, name, function (`readBindingTable`; held to PLAT-08's table by the test). */
export const USAGE_POLICY_COMMAND_ROWS = [
  { row: 139, id: 140, name: 'GetUsagePolicy', fn: 0x2797c0 },
  { row: 47, id: 40, name: 'LobbyLogout', fn: 0x27dcc0 },
] as const;
export type UsagePolicyCommandName = (typeof USAGE_POLICY_COMMAND_ROWS)[number]['name'];

/**
 * Every bound function `dlgUsagePolicy.rdr`'s chapter names (its layout's bindings, its own set and `UIanim.rdr`'s
 * `OnSystemMessage`: ONL-33's pin, `tools/test/onlineDialogs.pinned.json`), each answered by a task, as ONL-04's
 * `UNIVERSE_ENTRY_COMMANDS` does. `tools/test/usagePolicyEntryCommands.test.ts` holds the list to the pin.
 */
export const USAGE_POLICY_ENTRY_COMMANDS: readonly DnasEntryCommand[] = [
  { name: 'SwitchMenu', status: 'earlier', task: 'PLAT-10', spelt: ['SWITCHMENU'] },
  { name: 'PopUpDialog', status: 'earlier', task: 'PLAT-10', spelt: ['POPUPDIALOG'] },
  { name: 'ActivateButton', status: 'earlier', task: 'PLAT-10', spelt: [] },
  { name: 'SuspendMenuInput', status: 'earlier', task: 'PLAT-11', spelt: [] },
  { name: 'NetCnfClose', status: 'earlier', task: 'ONL-01', spelt: [] },
  { name: 'NetCnfUninit', status: 'earlier', task: 'ONL-01', spelt: ['NetCnfUnInit'] },
  { name: 'GetUsagePolicy', status: 'here', task: 'ONL-08', spelt: [] },
  { name: 'LobbyLogout', status: 'here', task: 'ONL-08', spelt: [] },
  {
    name: 'RefreshRoomList', status: 'declared', task: 'ONL-11', spelt: [],
    why: "ONSTART's `retrieve_usage`: the briefing rooms' list asked for ahead of SOCOM II ONLINE (`FUN_0027daa0` D:L126149-126170 -> `FUN_002e3a30`); the rooms are SVC-06's and ONL-11's. The table answers its not-implemented placeholder (true), so `retrieve_usage` runs on to GetUsagePolicy",
  },
  {
    name: 'GetFriendInvitations', status: 'declared', task: 'ONL-24', spelt: [],
    why: "ONSTART's `retrieve_usage`: the buddy confirmations asked for (`FUN_0027a2b0` D:L124343-124350 -> `FUN_003012f0`, only while the lobby is up in state 11). Its body is ONL-24's (`FriendListCommands.GetFriendInvitations`, `./friendListCommands`, web research 269 §3), mounted on the session (`packages/viewer/src/friendListHost.ts`), its replies FRIENDS' ConfirmationList; this chapter's own rig does not mount it, so there the table's declared row answers 1",
  },
  {
    name: 'UnInitNetwork', status: 'declared', task: 'ONL-10', spelt: [],
    why: "DECLINE's `ReturnToMMenu` after YES: the network torn down before the reboot; its body (`FUN_0027e5c0` D:L126505-126515) disconnects the lobby and stops the DME layer, then answers 1 -- ONL-10's, mounted on the session (`logoffCommands.ts`, web research 160 §2.2); the table answers 1 unimplemented too, so `SWITCHMENU(REBOOT)` follows",
  },
];

/** The request's one word (`FUN_002f79f0` +0x28: `MediusPolicyType` Usage, `RT.Common/Types.cs:266-270`). */
export const USAGE_POLICY_QUERY = { type: 0 } as const;
export type UsagePolicyQuery = { type: number };

/** The UI variables and texts `FUN_002f79f0` writes (the ELF's strings at 0x3f5828, 0x3f5860, 0x3f5840, 0x3f5870). */
export const USAGE_POLICY_VAR = 'UsagePolicy';
export const TEMP_USAGE_POLICY_VAR = 'TempUsagePolicy';
export const USAGE_POLICY_RETRIEVING = 'Retrieving Usage Policy.....';
export const USAGE_POLICY_TEMP_START = ' ';

/** One Lobby 0x48 reply (`MediusGetPolicyResponse`): the fields `FUN_002f7ac0` reads (+0x18, +0x1c:256, +0x11c). */
export interface UsagePolicyChunk { status: number; policy: string; endOfText: boolean }
/** The page's half: the request sent, the replies back in order (a rejection is a request never answered). */
export interface UsagePolicyService { policy(q: UsagePolicyQuery): Promise<UsagePolicyChunk[]> }

/**
 * LOBBY_SESSION_UP_READING: `FUN_002f79f0` sends only while the lobby session's +0x7d is set, which `LobbyConnect`
 * (`FUN_00276780` -> `FUN_002e0030`, D:L122535, D:L182633-182634) sets and the session's teardown clears. The port has
 * no lobby session before ONL-07's `LobbyConnect`; the original reaches the agreement only past it (research 128
 * R128.1: `dlgNetConnect` -> `dlgUsagePolicy`), so absent the page's hook the session counts as up. ONL-07 hands its
 * flag in (`lobbyUp`). [reading] *Handed in on the page since ONL-07 (2026-10-05): `FrontEndSession` passes the lobby
 * client's flag (`LobbyClient.up`, research 157 §5); the reading stands for a host with no lobby.*
 */
export const LOBBY_SESSION_UP_READING = 'no hook: up (the agreement is reached past LobbyConnect); ONL-07 hands its flag in' as const;

/**
 * LOBBY_LOGOUT_STUB_READING: `LobbyLogout` (`FUN_0027dcc0` D:L126223-126238) reads the lobby's state byte
 * `DAT_0044f3d0`: 0 (no lobby), answer 1; 0x12, answer 0; any other, the logout request (`FUN_002fa560(0x44f370)`, not
 * followed) and answer 0 -- a statement answering 0 holds its sequence and is asked again next tick, so DECLINE's chain
 * waits on the state's return to 0. The body is ONL-10's (logoff); this stub transcribes the answer and tells the page's
 * hook where the request would go, until ONL-10 binds its own. Absent a state hook, the state is 0: the port has no
 * lobby before ONL-07. [reading]
 */
export const LOBBY_LOGOUT_STUB_READING = 'the answer transcribed; the request (FUN_002fa560) the page\'s hook; ONL-10 owns the body' as const;

export interface UsagePolicyCommandsOptions {
  /** The game's one `CUIVarManager` (0x437e80). */
  uiVars: UiVarManager;
  /** The policy request's service (SVC-05's `/texts/policy`). */
  service: UsagePolicyService;
  /** The lobby session's +0x7d (`LOBBY_SESSION_UP_READING`); absent, up. */
  lobbyUp?: () => boolean;
  /** The lobby's state byte `DAT_0044f3d0` (`LOBBY_LOGOUT_STUB_READING`); absent, 0. */
  lobbyState?: () => number;
  /** Where `FUN_002fa560`'s logout request goes (`LOBBY_LOGOUT_STUB_READING`); absent, nothing. */
  lobbyLogout?: () => void;
  /** A row called, as it happens. */
  log?: (name: UsagePolicyCommandName, arg: string, answer: boolean) => void;
}

export class UsagePolicyCommands {
  constructor(private readonly o: UsagePolicyCommandsOptions) {}

  private answer(name: UsagePolicyCommandName, cmd: ZAnimUiCommand, answer: boolean): boolean {
    this.o.log?.(name, cmd.arg, answer);
    return answer;
  }

  /** `FUN_002797c0` -> `FUN_002f79f0` (D:L196630-196652): the two vars and the request, while the session is up; answer 1. */
  GetUsagePolicy: UiCommandHandler = (cmd) => {
    if (this.o.lobbyUp?.() ?? true) {
      const vars = this.o.uiVars;
      vars.set(vars.add(USAGE_POLICY_VAR, null, 1), { type: 'string', value: USAGE_POLICY_RETRIEVING });
      vars.set(vars.add(TEMP_USAGE_POLICY_VAR, null, 1), { type: 'string', value: USAGE_POLICY_TEMP_START });
      this.o.service.policy({ ...USAGE_POLICY_QUERY }).then((chunks) => {
        for (const c of chunks) this.policyChunk(c);
      }, () => { /* never answered: "Retrieving Usage Policy....." stays */ });
    }
    return this.answer('GetUsagePolicy', cmd, true);
  };

  /** `FUN_002f7ac0` (D:L196655-196712): one Lobby 0x48 reply. */
  policyChunk(c: UsagePolicyChunk): void {
    if (c.status !== 0) return;
    const vars = this.o.uiVars;
    const temp = vars.add(TEMP_USAGE_POLICY_VAR, null, 1);
    const parts: UiVarValue[] = [];
    if (temp.value.type === 'array') for (const e of temp.value.value) if (e.type === 'string') parts.push(e);
    parts.push({ type: 'string', value: c.policy });
    const value: UiVarValue = { type: 'array', value: parts };
    vars.set(c.endOfText ? vars.add(USAGE_POLICY_VAR, null, 1) : temp, value);
  }

  /** `FUN_0027dcc0` (D:L126223-126238), stubbed (`LOBBY_LOGOUT_STUB_READING`): 1 with no lobby; else 0, the logout told. */
  LobbyLogout: UiCommandHandler = (cmd) => {
    const state = this.o.lobbyState?.() ?? 0;
    if (state === 0) return this.answer('LobbyLogout', cmd, true);
    if (state !== 0x12) this.o.lobbyLogout?.();
    return this.answer('LobbyLogout', cmd, false);
  };

  /** The entries by their table name. */
  entries(): Record<UsagePolicyCommandName, UiCommandHandler> {
    return { GetUsagePolicy: this.GetUsagePolicy, LobbyLogout: this.LobbyLogout };
  }

  /** Each row's body set in PLAT-08's host (`UiCommandHost.setHandler`). */
  register(host: UiCommandHost): void {
    for (const [name, h] of Object.entries(this.entries())) host.setHandler(name, h);
  }
}
