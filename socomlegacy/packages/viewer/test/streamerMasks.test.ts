// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LAN_GAME_LINE, shownDetailLines } from '../src/scoreboard';
import { INVITE_COPIED_LINE, INVITE_COPY_REFUSED_LINE, INVITE_LINK_HIDDEN_LINE, inviteCopyLine } from '../src/inviteHost';
import { onUiVarDisplayChange, ownNameDrawn, uiVarMasked, uiVarShownText } from '@s2u/ui';
import { HIDDEN_DETAIL_WORDS, OWN_NAME_HIDDEN_WORDS, OWN_NAME_VARS, resetStreamerCache, saveStreamerRow, setStreamerMode } from '../src/streamerMode';

/**
 * STREAMER-P1 slice 1 (product track, a browser adaptation; the scope's s3.4 and s4.5): with Room and account details
 * Hidden, none of the five details is drawn; with the mode Off, each is exactly as before.
 */
beforeEach(() => { localStorage.clear(); resetStreamerCache(); });
afterEach(() => { localStorage.clear(); resetStreamerCache(); });

describe('STREAMER-P1: GAME DETAILS (scoreboard)', () => {
  const online: [string, string, string] = ['US East (Ohio)', 'Night Ops', 'DEMOLITION'];
  const lan: [string, string, string] = [LAN_GAME_LINE, 'CROSSROADS', 'DEMOLITION'];

  it('Off: the lines as before', () => {
    expect(shownDetailLines(online)).toEqual(online);
    expect(shownDetailLines(lan)).toEqual(lan);
  });
  it('On (preset Hidden): the lobby or server line and the game line read Hidden; the type word and "LAN game" stay', () => {
    setStreamerMode(true);
    expect(shownDetailLines(online)).toEqual([HIDDEN_DETAIL_WORDS, HIDDEN_DETAIL_WORDS, 'DEMOLITION']);
    expect(shownDetailLines(lan)).toEqual([LAN_GAME_LINE, HIDDEN_DETAIL_WORDS, 'DEMOLITION']);
  });
  it('On with details set back to Shown: as before', () => {
    setStreamerMode(true);
    saveStreamerRow('details', 'shown');
    expect(shownDetailLines(online)).toEqual(online);
  });
});

describe('STREAMER-P1: the invite link (the GAME LOBBY button)', () => {
  const href = 'https://example.test/online/lobby/abc123';
  it('Off: a copy says so; a refused copy draws the link to copy by hand, as before', () => {
    expect(inviteCopyLine(true, href)).toBe(INVITE_COPIED_LINE);
    expect(inviteCopyLine(false, href)).toBe(`${INVITE_COPY_REFUSED_LINE} ${href}`);
  });
  it('Hidden: the copy still says copied; a refused copy never draws the link', () => {
    setStreamerMode(true);
    expect(inviteCopyLine(true, href)).toBe(INVITE_COPIED_LINE);
    expect(inviteCopyLine(false, href)).toBe(INVITE_LINK_HIDDEN_LINE);
    expect(INVITE_LINK_HIDDEN_LINE).not.toContain('abc123');
    expect(INVITE_LINK_HIDDEN_LINE).toMatch(/streamer mode/i);
  });
});

describe('STREAMER-P1: the game passwords (the ui package’s display mask)', () => {
  it('Off: no variable is masked beyond the original’s own SECURETEXT', () => {
    expect(uiVarMasked('PlayerGamePassword')).toBe(false);
    expect(uiVarMasked('SpectatorGamePassword')).toBe(false);
  });
  it('Hidden: the two game passwords draw as asterisks; nothing else is masked', () => {
    setStreamerMode(true);
    expect(uiVarMasked('PlayerGamePassword')).toBe(true);
    expect(uiVarMasked('SpectatorGamePassword')).toBe(true);
    expect(uiVarMasked('PLAYERNAMEVAR')).toBe(false);
    expect(uiVarMasked('GAMENAMEVAR')).toBe(false);
    saveStreamerRow('details', 'shown');
    expect(uiVarMasked('PlayerGamePassword')).toBe(false);
  });
  /**
   * The controller's YES (2026-11-24): the clan password, a plain TEXT on the roster leader's page (dlgManageRosterLeader
   * `txtClanPassword`, UIVAR `Clan_Password`, read off the disc through `loadDialog`), is masked like the game passwords.
   */
  it('Hidden: the clan password (Clan_Password, a plain TEXT on the roster leader page) draws as asterisks too', () => {
    expect(uiVarMasked('Clan_Password')).toBe(false);
    setStreamerMode(true);
    expect(uiVarMasked('Clan_Password')).toBe(true);
    expect(uiVarMasked('CLAN_PASSWORD')).toBe(true);
    saveStreamerRow('details', 'shown');
    expect(uiVarMasked('Clan_Password')).toBe(false);
  });
});

/**
 * The controller's ruling (2026-11-24 20:13Z, a P1 fold): while details are Hidden the own-name vars draw YOU (the clan
 * tag dropped with the name) and the clan name "Hidden (streamer mode)"; the name-entry fields are left as typed. Which
 * widget prints which var was read off the disc's READERC/READERX through `loadDialog`: PLAYER_NAME_AND_TAG in 17
 * dialogs' `playername` (WRAPPEDTEXT), PLAYERNAMEVAR and LANPLAYERNAMEVAR in `playername` (TEXT) and in the entry pages'
 * `playername_val` (dlgNetPlayerName, dlgLANPlayerName), CLANNAMEVAR in 6 dialogs' `txtClanName` (TEXT).
 */
describe('STREAMER-P1: the own name and the clan name (the ui display rule)', () => {
  it('Off: every var prints as typed', () => {
    for (const v of OWN_NAME_VARS) expect(uiVarShownText(v, 'playername', 'KiLL [TAG]')).toBe('KiLL [TAG]');
    expect(uiVarShownText('CLANNAMEVAR', 'txtClanName', 'The Clan')).toBe('The Clan');
  });
  it('Hidden: the own-name vars draw YOU, the clan name Hidden; other vars as typed', () => {
    setStreamerMode(true);
    expect([...OWN_NAME_VARS].sort()).toEqual(['LANPLAYERNAMEVAR', 'PLAYERNAMEVAR', 'PLAYER_NAME_AND_TAG']);
    for (const v of OWN_NAME_VARS) expect(uiVarShownText(v, 'playername', 'KiLL [TAG]')).toBe(OWN_NAME_HIDDEN_WORDS);
    expect(uiVarShownText('player_name_and_tag', 'playername', 'KiLL')).toBe(OWN_NAME_HIDDEN_WORDS);
    expect(uiVarShownText('CLANNAMEVAR', 'txtClanName', 'The Clan')).toBe(HIDDEN_DETAIL_WORDS);
    expect(uiVarShownText('GAMENAMEVAR', 'gamename', 'g1')).toBe('g1');
    expect(uiVarShownText('PLAYER_INFO_NAME_VAR', 'playername', 'someone')).toBe('someone');
  });
  it('Hidden: the name-entry fields (playername_val) are left as typed', () => {
    setStreamerMode(true);
    expect(uiVarShownText('PLAYERNAMEVAR', 'playername_val', 'KiLL')).toBe('KiLL');
    expect(uiVarShownText('LANPLAYERNAMEVAR', 'playername_val', 'KiLL')).toBe('KiLL');
  });
  it('details set back to Shown: as typed', () => {
    setStreamerMode(true);
    saveStreamerRow('details', 'shown');
    expect(uiVarShownText('PLAYERNAMEVAR', 'playername', 'KiLL')).toBe('KiLL');
    expect(uiVarShownText('CLANNAMEVAR', 'txtClanName', 'The Clan')).toBe('The Clan');
  });
});

describe("STREAMER-P1: CREATE CLAN's clan name is left as typed (the controller's F1 ruling, 2026-11-24)", () => {
  it('Hidden: txtClanName on dlgCreateClan as typed; on the other five dialogs Hidden', () => {
    setStreamerMode(true);
    expect(uiVarShownText('CLANNAMEVAR', 'txtClanName', 'The Clan', 'dlgCreateClan.rdr')).toBe('The Clan');
    expect(uiVarShownText('CLANNAMEVAR', 'txtClanName', 'The Clan', 'DLGCREATECLAN.RDR')).toBe('The Clan');
    for (const d of ['dlgClanLadderLobby.rdr', 'dlgInvitedPlayers.rdr', 'dlgManageRoster.rdr', 'dlgManageRosterLeader.rdr', 'dlgRespondToInvites.rdr']) {
      expect(uiVarShownText('CLANNAMEVAR', 'txtClanName', 'The Clan', d)).toBe(HIDDEN_DETAIL_WORDS);
    }
    expect(uiVarShownText('PLAYER_NAME_AND_TAG', 'playername', 'KiLL', 'dlgCreateClan.rdr')).toBe(OWN_NAME_HIDDEN_WORDS);
  });
});

describe("STREAMER-P1: a toggle redraws the open menu page (the controller's ruling (d))", () => {
  it('turning the mode on or off, or the details row, tells the ui display rule to redraw', () => {
    let told = 0;
    const off = onUiVarDisplayChange(() => { told += 1; });
    try {
      setStreamerMode(true);
      expect(told).toBeGreaterThanOrEqual(1);
      const n = told;
      saveStreamerRow('details', 'shown');
      expect(told).toBeGreaterThan(n);
      const m = told;
      setStreamerMode(false);
      expect(told).toBeGreaterThan(m);
    } finally { off(); }
  });
});

describe('IQ-183: the own name on the front end’s own screens (the ui package’s own-name rule)', () => {
  it('Off: the own name drawn as it is; Hidden: YOU; details Shown again: the name', () => {
    expect(ownNameDrawn('socomc')).toBe('socomc');
    setStreamerMode(true);
    expect(ownNameDrawn('socomc')).toBe('YOU');
    saveStreamerRow('details', 'shown');
    expect(ownNameDrawn('socomc')).toBe('socomc');
  });
});
