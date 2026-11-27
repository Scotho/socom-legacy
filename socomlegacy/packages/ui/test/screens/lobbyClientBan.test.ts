import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseRdr, Zar } from '@s2u/archive';
import { FONTS_RDR } from '@s2u/scene';
import { DIALOG_EVENTS } from '../../src/dialog';
import { readTextFaces } from '../../src/text/face';
import { measureText } from '../../src/text/layout';
import { ValveStore } from '../../src/valves';
import {
  BANNED_PERMANENT_ADAPTATION, LOBBY_STATE, LOGIN_FAILURE_TEXT, LobbyClient, MEDIUS_STATUS, PLAYER_BANNED_STATUS, banSentence, localZoneOffset,
  type LobbyClientOptions, type LobbyLoginReply, type LobbyService,
} from '../../src/screens/lobbyClient';
import type { AcctRecord } from '../../src/screens/personaCommands';
import { CONNECT, HAVE, UNIVERSE, personaRig } from './personaRig';

/**
 * OPS-A3 (owner row H464; product track, a browser adaptation -- a service ban has no original): the classic sign-in's
 * one change. The original's AccountLogin callback shows any status it does not tell apart as MP_MEDIUS_ERROR with
 * "Login Failure" (`FUN_002eefa0` D:L191179-191182); for central's banned refusal (-972) the page passes the ban's
 * sentence as that event's text instead -- the same event, the same dialog (`dlgNetConnect.rdr`'s `OnNetError`), its
 * timing and every other status's text unchanged. What the dialog can hold is measured here on the disc's own popup
 * record and face (the committed fixtures), not assumed. Every reason invented.
 */

const E = DIALOG_EVENTS;
/** A typed password, made up for the tests. */
const TYPED = 'secret';
const T = Date.UTC(2026, 10, 15, 2, 30);
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function fake(reply: LobbyLoginReply, over: Partial<LobbyService> = {}): LobbyService {
  return { login: () => Promise.resolve(reply), register: () => Promise.resolve({ status: 0 }), ...over };
}

async function answered(service: LobbyService, over: Partial<LobbyClientOptions> = {}, register = false) {
  const valves = new ValveStore();
  const events: Array<[number, string | null]> = [];
  const lobby = new LobbyClient({ valves: () => valves, service, event: (kind, text) => { events.push([kind, text]); }, locText: (id) => `#${id}`, ...over });
  lobby.connect('lobby.test', 10075);
  for (let i = 0; i < 2; i++) { await flush(); lobby.step(); }
  if (register) lobby.register('socomc', TYPED); else lobby.login('socomc', TYPED);
  for (let i = 0; i < 5; i++) { await flush(); lobby.step(); }
  return { lobby, events: events.slice(1) };
}

describe("OPS-A3: the classic sign-in's text for a banned account (-972)", () => {
  it("-972 with no ban field (an older central) or until null: MP_MEDIUS_ERROR with the permanent sentence, state 7, as any other failure", async () => {
    for (const reply of [{ status: PLAYER_BANNED_STATUS }, { status: PLAYER_BANNED_STATUS, ban: { until: null } }] as LobbyLoginReply[]) {
      const t = await answered(fake(reply));
      expect([t.lobby.state(), t.events]).toEqual([7, [[E.MP_MEDIUS_ERROR, BANNED_PERMANENT_ADAPTATION]]]);
      expect(t.lobby.loggedIn()).toBe(false);
    }
  });

  it("-972 with an end: the timed sentence, local and UTC by the client's zone (pinned), and never the reason", async () => {
    const t = await answered(fake({ status: PLAYER_BANNED_STATUS, ban: { until: T, reason: 'invented <b>&' } }), { zoneOffset: () => -300 });
    expect(t.events).toEqual([[E.MP_MEDIUS_ERROR,
      'This account is banned until 14 Nov 2026 21:30 (15 Nov 2026 02:30 UTC). To ask about it, contact the staff on the SOCOM II Legacy Discord.']]);
  });

  it("every other status is as today: -998 state 10; -997, -978 their events; the rest \"Login Failure\"", async () => {
    expect((await answered(fake({ status: MEDIUS_STATUS.AccountNotFound }))).lobby.state()).toBe(LOBBY_STATE.ACCOUNT_NOT_FOUND);
    expect((await answered(fake({ status: MEDIUS_STATUS.AccountLoggedIn }))).events).toEqual([[E.MP_PLAYER_LOGGED_IN, null]]);
    expect((await answered(fake({ status: MEDIUS_STATUS.InvalidPassword, ban: { until: null } }))).events).toEqual([[E.MP_INVALID_PASSWORD, null]]);
    for (const status of [MEDIUS_STATUS.LoginFailed, MEDIUS_STATUS.Fail, -971, -973, -1, 5]) {
      expect((await answered(fake({ status, ban: { until: null } }))).events).toEqual([[E.MP_MEDIUS_ERROR, LOGIN_FAILURE_TEXT]]);
    }
    expect(LOGIN_FAILURE_TEXT).toBe('Login Failure');
  });

  it("the registration's login answered -972 is the registration's failure, state 6, as the original's (FUN_002eec10)", async () => {
    let n = 0;
    const s: LobbyService = { login: () => Promise.resolve({ status: PLAYER_BANNED_STATUS }), register: () => { n++; return Promise.resolve({ status: 0 }); } };
    const t = await answered(s, {}, true);
    expect([n, t.lobby.state(), t.events]).toEqual([1, LOBBY_STATE.REGISTRATION_FAILURE, []]);
  });
});

const rec = (name: string): AcctRecord => ({ host: UNIVERSE.dns, port: UNIVERSE.port, name, password: TYPED, hometown: '', gender: 0, savePassword: 1 });

describe.skipIf(!HAVE)(`OPS-A3: what the classic dialog can hold, measured on the disc's popup and face${HAVE ? '' : ' (no disc and no fixtures)'}`, () => {
  // read in a hook, never at collection (tools/test/skipIfFactories): without the data the describe is skipped, said
  let faces: ReturnType<typeof readTextFaces> = [];
  beforeAll(() => {
    const fonts = Zar.parse(new Uint8Array(readFileSync(new URL(`../../../../test-fixtures/${FONTS_RDR.archive}`, import.meta.url))));
    faces = readTextFaces(parseRdr(fonts.data(fonts.find(FONTS_RDR.member)!)));
  });
  const face = (n: string) => faces.find((f) => f.name.toLowerCase() === n.toLowerCase()) ?? null;

  /** CONNECT on the persona form, the login answered `reply`: the popup `dlgNetConnect`'s set shows for it. */
  async function popupFor(reply: LobbyLoginReply) {
    const t = personaRig({ records: [rec('socomc')], connectService: fake(reply), face });
    await t.runReplies(40);
    t.press('CROSS', 0);
    await t.runReplies(40);
    expect([t.current(), t.shown()]).toEqual([CONNECT, true]);
    const p = t.parts.current!.popup()!.popup;
    const widths = p.text.lines.map((l) => measureText(p.face!, l.codes, p.text.scale * p.face!.scale).width);
    return { t, p, widths };
  }

  it("the original's own long refusals (#545, #543) fill 6 lines of a 340 x 150 popup; MP_MEDIUS_ERROR's is 340 x 200, wrapping at 290", async () => {
    for (const status of [MEDIUS_STATUS.InvalidPassword, MEDIUS_STATUS.AccountLoggedIn]) {
      const { p } = await popupFor({ status });
      expect([p.w, p.h, p.textX, p.textY, p.text.width, p.text.lines.length]).toEqual([340, 150, 25, 45, 290, 6]);
    }
    const { p, t } = await popupFor({ status: MEDIUS_STATUS.LoginFailed });
    expect(t.popupText()).toBe(LOGIN_FAILURE_TEXT);
    expect([p.x, p.y, p.w, p.h, p.textX, p.textY, p.text.width]).toEqual([150, 180, 340, 200, 25, 45, 290]);
  });

  it("the permanent sentence and the longest timed one fit it unchanged: no more lines than the original's 150-high popups hold, none past the wrap", async () => {
    const longest = { until: Date.UTC(2026, 8, 28, 23, 59) };
    for (const reply of [{ status: PLAYER_BANNED_STATUS }, { status: PLAYER_BANNED_STATUS, ban: longest }] as LobbyLoginReply[]) {
      const { p, t, widths } = await popupFor(reply);
      expect(t.popupText()).toBe(reply.ban ? banSentence(longest, localZoneOffset) : BANNED_PERMANENT_ADAPTATION);
      expect(p.h).toBe(200);
      expect(p.text.lines.length).toBeLessThanOrEqual(6);
      for (const w of widths) expect(w).toBeLessThanOrEqual(p.text.width);
    }
  });
});
