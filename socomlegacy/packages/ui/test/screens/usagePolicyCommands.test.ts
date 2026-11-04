import { describe, expect, it } from 'vitest';
import { UI_COMMAND_TABLE, UiCommandHost, uiCommandRowByName } from '../../src/uiCommands';
import { UiVarManager, type UiVarValue } from '../../src/uiVars';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import {
  LOBBY_LOGOUT_STUB_READING, LOBBY_SESSION_UP_READING, TEMP_USAGE_POLICY_VAR, USAGE_POLICY_COMMAND_ROWS, USAGE_POLICY_QUERY,
  USAGE_POLICY_RETRIEVING, USAGE_POLICY_TEMP_START, USAGE_POLICY_VAR, UsagePolicyCommands, type UsagePolicyChunk, type UsagePolicyService,
} from '../../src/screens/usagePolicyCommands';

/**
 * ONL-08: USER AGREEMENT's data (web research 156 §1). `GetUsagePolicy` (`FUN_002797c0` D:L123946-123953 ->
 * `FUN_002f79f0` D:L196630-196652: the policy request, Lobby 0x47, type 0) and its reply handler (`FUN_002f7ac0`
 * D:L196655-196712: the chunks joined into an array, UsagePolicy on EndOfText), and `LobbyLogout`'s stub for DECLINE's
 * chain (`FUN_0027dcc0` D:L126223-126238, ONL-10's body). Synthetic replies over a fake service; nothing measured on the
 * original running.
 */

const cmd = (fn: string, arg = 'NA', anim = 'retrieve_usage'): ZAnimUiCommand =>
  ({ anim, sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(0x10) });
const call = (c: ZAnimUiCommand) => [c, uiCommandRowByName(c.fn!)!, undefined] as const;
const chunk = (policy: string, endOfText = true, status = 0): UsagePolicyChunk => ({ status, policy, endOfText });
const str = (s: string): UiVarValue => ({ type: 'string', value: s });
const arr = (...s: string[]): UiVarValue => ({ type: 'array', value: s.map(str) });
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function fake(reply: UsagePolicyChunk[] | null) {
  const queries: unknown[] = [];
  let answer!: (r: UsagePolicyChunk[]) => void;
  const service: UsagePolicyService = {
    policy: (q) => {
      queries.push(q);
      if (reply) return Promise.resolve(reply);
      return new Promise((r) => { answer = r; });
    },
  };
  return { service, queries, answer: (r: UsagePolicyChunk[]) => answer(r) };
}

function rig(o: { reply?: UsagePolicyChunk[] | null; lobbyUp?: boolean } = {}) {
  const uiVars = new UiVarManager();
  const f = fake(o.reply === undefined ? [chunk('EULA')] : o.reply);
  const logouts: number[] = [];
  const c = new UsagePolicyCommands({
    uiVars, service: f.service, lobbyUp: o.lobbyUp === undefined ? undefined : () => o.lobbyUp!, lobbyLogout: () => { logouts.push(1); },
  });
  return { uiVars, c, ...f, logouts, value: (n: string) => uiVars.find(n)?.value };
}

describe('the rows (W9.R4: PLAT-08\'s host is a registry; no table edit)', () => {
  it('GetUsagePolicy is the table\'s row 139 (id 140, FUN_002797c0, declared for ONL-08); LobbyLogout row 47 (id 40, ONL-10\'s, a stub here)', () => {
    expect(USAGE_POLICY_COMMAND_ROWS.map((r) => `${r.row} ${r.id} ${r.name}`)).toEqual(['139 140 GetUsagePolicy', '47 40 LobbyLogout']);
    for (const r of USAGE_POLICY_COMMAND_ROWS) {
      const row = uiCommandRowByName(r.name)!;
      expect([row.index, row.id, row.fn], r.name).toEqual([r.row, r.id, r.fn]);
      expect(UI_COMMAND_TABLE[r.row]!.name).toBe(r.name);
    }
    expect(uiCommandRowByName('GetUsagePolicy')!.task).toBe('ONL-08');
    expect(uiCommandRowByName('LobbyLogout')!.task).toBe('ONL-10');
  });

  it('registers both bodies in the host; a dispatch by name reaches them', () => {
    const r = rig();
    const host = new UiCommandHost();
    r.c.register(host);
    expect(host.dispatch(cmd('GetUsagePolicy'))).toMatchObject({ kind: 'table', answer: true });
    expect(host.dispatch(cmd('LobbyLogout', 'NA', 'ReturnToMMenu'))).toMatchObject({ kind: 'table', answer: true });
    expect(r.queries).toHaveLength(1);
  });
});

describe('GetUsagePolicy (FUN_002797c0 -> FUN_002f79f0)', () => {
  it('names the request: the policy type 0, Usage, at +0x28 (MediusPolicyType, Types.cs:266-270), and the vars and texts', () => {
    expect(USAGE_POLICY_QUERY).toEqual({ type: 0 });
    expect([USAGE_POLICY_VAR, TEMP_USAGE_POLICY_VAR, USAGE_POLICY_RETRIEVING, USAGE_POLICY_TEMP_START])
      .toEqual(['UsagePolicy', 'TempUsagePolicy', 'Retrieving Usage Policy.....', ' ']);
  });

  it('with the lobby session up: UsagePolicy "Retrieving Usage Policy.....", TempUsagePolicy " ", one request; answer 1', () => {
    const r = rig({ reply: null });
    expect(r.c.GetUsagePolicy(...call(cmd('GetUsagePolicy')))).toBe(true);
    expect(r.queries).toEqual([{ type: 0 }]);
    expect(r.value(USAGE_POLICY_VAR)).toEqual(str('Retrieving Usage Policy.....'));
    expect(r.value(TEMP_USAGE_POLICY_VAR)).toEqual(str(' '));
    expect(r.uiVars.find(USAGE_POLICY_VAR)!.longevity).toBe(1);
    expect(r.uiVars.find(TEMP_USAGE_POLICY_VAR)!.longevity).toBe(1);
  });

  it('with the lobby session down (+0x7d clear): nothing set, nothing sent; answer 1', () => {
    const r = rig({ lobbyUp: false });
    expect(r.c.GetUsagePolicy(...call(cmd('GetUsagePolicy')))).toBe(true);
    expect(r.queries).toEqual([]);
    expect(r.uiVars.find(USAGE_POLICY_VAR)).toBeUndefined();
  });

  it('LOBBY_SESSION_UP_READING: absent a lobby hook, the session counts as up (the agreement is reached past LobbyConnect)', () => {
    expect(LOBBY_SESSION_UP_READING).toMatch(/LobbyConnect/);
    const r = rig();
    r.c.GetUsagePolicy(...call(cmd('GetUsagePolicy')));
    expect(r.queries).toHaveLength(1);
  });
});

describe('the reply (FUN_002f7ac0): the chunks joined, UsagePolicy on EndOfText', () => {
  it('one chunk that ends the text: UsagePolicy the one-element array', async () => {
    const r = rig({ reply: [chunk('EULA')] });
    r.c.GetUsagePolicy(...call(cmd('GetUsagePolicy')));
    await flush();
    expect(r.value(USAGE_POLICY_VAR)).toEqual(arr('EULA'));
    expect(r.value(TEMP_USAGE_POLICY_VAR)).toEqual(str(' '));          // a string, not an array: never read as a chunk
  });

  it('three chunks: TempUsagePolicy grows [a], [a, b]; UsagePolicy is [a, b, c] at the last', () => {
    const r = rig({ reply: null });
    r.c.GetUsagePolicy(...call(cmd('GetUsagePolicy')));
    r.c.policyChunk(chunk('a', false));
    expect(r.value(TEMP_USAGE_POLICY_VAR)).toEqual(arr('a'));
    expect(r.value(USAGE_POLICY_VAR)).toEqual(str('Retrieving Usage Policy.....'));
    r.c.policyChunk(chunk('b', false));
    expect(r.value(TEMP_USAGE_POLICY_VAR)).toEqual(arr('a', 'b'));
    r.c.policyChunk(chunk('c', true));
    expect(r.value(USAGE_POLICY_VAR)).toEqual(arr('a', 'b', 'c'));
    expect(r.value(TEMP_USAGE_POLICY_VAR)).toEqual(arr('a', 'b'));      // left as it was: the last is not written back
  });

  it('a failure status (FUN_002f42d0: status != 0) changes nothing: "Retrieving Usage Policy....." stays', async () => {
    const r = rig({ reply: [chunk('', true, -966)] });
    r.c.GetUsagePolicy(...call(cmd('GetUsagePolicy')));
    await flush();
    expect(r.value(USAGE_POLICY_VAR)).toEqual(str('Retrieving Usage Policy.....'));
  });

  it('a request never answered (the service rejects) leaves "Retrieving Usage Policy....."', async () => {
    const uiVars = new UiVarManager();
    const c = new UsagePolicyCommands({ uiVars, service: { policy: () => Promise.reject(new Error('down')) } });
    c.GetUsagePolicy(...call(cmd('GetUsagePolicy')));
    await flush();
    expect(uiVars.find(USAGE_POLICY_VAR)!.value).toEqual(str('Retrieving Usage Policy.....'));
  });

  it('a second GetUsagePolicy starts TempUsagePolicy again from " ": an earlier partial text is not carried', () => {
    const r = rig({ reply: null });
    r.c.GetUsagePolicy(...call(cmd('GetUsagePolicy')));
    r.c.policyChunk(chunk('old', false));
    r.c.GetUsagePolicy(...call(cmd('GetUsagePolicy')));
    expect(r.value(TEMP_USAGE_POLICY_VAR)).toEqual(str(' '));
    r.c.policyChunk(chunk('new', true));
    expect(r.value(USAGE_POLICY_VAR)).toEqual(arr('new'));
  });
});

describe('LobbyLogout\'s stub (FUN_0027dcc0 D:L126223-126238; ONL-10 owns the body)', () => {
  it('no lobby (DAT_0044f3d0 == 0): answer 1, nothing told', () => {
    expect(LOBBY_LOGOUT_STUB_READING).toMatch(/ONL-10/);
    const r = rig();
    expect(r.c.LobbyLogout(...call(cmd('LobbyLogout', 'NA', 'ReturnToMMenu')))).toBe(true);
    expect(r.logouts).toEqual([]);
  });

  it('a lobby logged in: the page\'s logout told and answer 0 (the statement held until the state is back to 0)', () => {
    const uiVars = new UiVarManager();
    let state = 5;
    const told: number[] = [];
    const c = new UsagePolicyCommands({ uiVars, service: fake(null).service, lobbyState: () => state, lobbyLogout: () => { told.push(state); } });
    expect(c.LobbyLogout(...call(cmd('LobbyLogout')))).toBe(false);
    expect(told).toEqual([5]);
    state = 0x12;                                                        // the state 0x12: held, not told again
    expect(c.LobbyLogout(...call(cmd('LobbyLogout')))).toBe(false);
    expect(told).toEqual([5]);
    state = 0;
    expect(c.LobbyLogout(...call(cmd('LobbyLogout')))).toBe(true);
  });
});
