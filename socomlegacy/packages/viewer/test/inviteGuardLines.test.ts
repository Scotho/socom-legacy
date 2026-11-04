// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { UiCommandHost, UiVarManager, ValveStore, type InviteLink, type ZAnimUiCommand } from '@s2u/ui';
import { connectLobby, pageAccountService, SIGNED_IN_ELSEWHERE_ADAPTATION, SIGNED_IN_ELSEWHERE_LINE_ID, signedInElsewhereLine } from '../src/connectHost';
import { guardInviteLogin, type InviteMount } from '../src/inviteHost';

/**
 * LOBBY-INVITE's batch review, finding 1 (blocking): the login guard keeps the account service's identity, so the
 * page's two lines that `connectHost` keys on the service (`ABSENT_LINES`, `ELSEWHERE_LINES`) still reach
 * `connectLobby` -- with an invite in the address and without one. Every name, password and ticket invented.
 */

const PW = 'invented-pw-guard';
const LINK: InviteLink = { mediusWorldId: 7, game: 'friday', universe: null };
const cmd = (fn: string): ZAnimUiCommand => ({ anim: 'a', sequence: 'main', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg: 'NA', loc: 0, bytes: new Uint8Array(0x18) });
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const line = (): HTMLElement | null => document.getElementById(SIGNED_IN_ELSEWHERE_LINE_ID);

afterEach(() => { document.body.replaceChildren(); });

/** The page's account service through the guard, a lobby over it logged in, its session then taken over elsewhere. */
async function takenOver(link: InviteLink | null): Promise<void> {
  const fetchFn = ((url: string) => {
    if (String(url).endsWith('/account/login')) return Promise.resolve(new Response(JSON.stringify({ status: 0, ticket: 'tkt' }), { status: 200 }));
    if (String(url).endsWith('/lobby/update-user-state')) return Promise.resolve(new Response(JSON.stringify({ reason: 'taken-over' }), { status: 401 }));
    return Promise.resolve(new Response(JSON.stringify({ status: 0 }), { status: 200 }));
  }) as unknown as typeof fetch;
  const base = pageAccountService('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false, fetchFn, null, signedInElsewhereLine(document));
  const mount: InviteMount = { link, id: 'N', open: () => null, pending: () => link !== null, consumed: () => {}, href: () => '', copy: () => Promise.resolve(true) };
  const service = guardInviteLogin(base, mount, () => {});
  expect(service, 'the guard keeps the service itself').toBe(base);
  const valves = new ValveStore(), uiVars = new UiVarManager(), host = new UiCommandHost();
  const c = connectLobby(host, { valves: () => valves, uiVars, service, event: () => {}, dialog: () => 'dlgNetConnect.rdr' });
  c.lobby.connect('', 0);
  c.frame(); await flush();
  uiVars.set(uiVars.add('PLAYERNAMEVAR', null, 1), { type: 'string', value: 'Kilo' });
  uiVars.set(uiVars.add('PLAYERPASSWORD', null, 1), { type: 'string', value: PW });
  host.dispatch(cmd('LobbyLogin'));
  for (let i = 0; i < 6; i++) { c.frame(); await flush(); }
  expect(c.lobby.ticket()).toBe('tkt');
  c.lobby.sessionLost('tkt');
  for (let i = 0; i < 4; i++) await flush();
}

describe('the login guard keeps the account service (the batch review\'s finding 1)', () => {
  it('no invite: the page\'s signed-in-elsewhere line still shows', async () => {
    await takenOver(null);
    expect(line()?.textContent).toContain(SIGNED_IN_ELSEWHERE_ADAPTATION);
  });

  it('an invite pending: the line shows too', async () => {
    await takenOver(LINK);
    expect(line()?.textContent).toContain(SIGNED_IN_ELSEWHERE_ADAPTATION);
  });
});
