import { describe, expect, it } from 'vitest';
import { readSoftKeyboards } from '../../src/keyboard';
import { engineCodes } from '../../src/text/codes';
import { LobbyClan } from '../../src/screens/createClanCommands';
import { ManageRosterCommands, type MyClansReply } from '../../src/screens/manageRosterCommands';
import { ManageRosterLeaderCommands, type ManageRosterLeaderService } from '../../src/screens/manageRosterLeaderCommands';
import type { ZAnimUiCommand } from '../../src/zanimRuntime';
import { uiParams } from '../keyboard/fixtures';
import { STEP, press, request, rig } from '../keyboard/walk';

/**
 * LATER 1030 (d): the clan tag's bytes through the page's UI variable, as the original's. `D:L<line>` = a line of
 * `socom2_game.elf.decomp.c`; transcribed, cited, never pasted; reading, pending review.
 *
 * The original's variable holds bytes: the keyboard encodes each code point as UTF-8 into its edit (`FUN_00399ec0`
 * D:L291415-291530 calling `FUN_0039fd80`) and its apply sets the variable to that byte string (`FUN_00399d20`
 * D:L291348-291396 -> `FUN_003862a0`); the tag post `sprintf`s the variable's string with `%s` (`FUN_002e7d70`
 * D:L187237-187246); GetMyClans sets Clan_Description to the C string at the stats' +15 (`FUN_002e8bd0` D:L187818,
 * `FUN_003862a0` of 0x44f5f7); the UTF-8 decoder and its lead-byte length are `FUN_0039f0c0` / `FUN_0039f160`
 * (D:L294576-294620) -- that every text reader goes through them is research 119 R119.6's, not re-read here. No step
 * transcodes. Research 119 R119.6 and section 6; research 262 R262.5 (0x44f464 is Clan_Description).
 *
 * "«G»" is the bytes C2 AB 47 C2 BB. The cancelled CLAN TAG: `clan_tag` runs `GetTextInput(Clan_Description)`, waits
 * for `skb_done` 1, then `NetCensorText` and `UpdateClanStats` (research 272 section 6); TRIANGLE cancels with
 * `ON_SKB_CANCEL` and the close and no apply (D:L283475-283478; research 119 section 7.1), and the close's end sets
 * `skb_done` 1 -- so the post reads the variable as GetMyClans left it.
 */

const params = readSoftKeyboards(uiParams());

/**
 * The three cases marked BLOCKED fail today (the RED run of 2026-11-15, LATER 1030 (d)) and are skipped, not counted:
 * the page's keyboard apply writes a code-point string (`src/keyboard/softKeyboard.ts` `apply`, `skbString`), where the
 * original's writes UTF-8 bytes (`FUN_00399d20`), and GetMyClans writes a byte string (`hexCString`), so
 * `clanStatsRecord`'s `TextEncoder` doubles a re-posted tag. Making them pass needs the keyboard's apply (and its
 * unchanged compare) to write bytes, outside this branch's claim; un-skip them with that change.
 * Ruled 2026-11-15 (the main controller, for the owner's Log): no patch in `clanStatsRecord` -- one string cannot say
 * whether it is code points or bytes, so any rule there is a guess; the cure is the keyboard writing bytes with every
 * service boundary carried (LATER 1105, planned as LATER 1106). All three stay skipped until then.
 */
const BLOCKED = 'BLOCKED (LATER 1105; its plan LATER 1106: the keyboard apply writes code points): ';
const GUILLEMETS_G = [0xc2, 0xab, 0x47, 0xc2, 0xbb];
const cmd = (fn: string): ZAnimUiCommand => ({ anim: 'clan_tag', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg: 'NA', loc: 0, bytes: new Uint8Array(0x10) });
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const hex = (bytes: number[]): string => bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
/** A clan stats record: "%.3d%.12d" of 0 and 0, the tag's bytes, zeros to 256. */
const statsHex = (tag: number[]): string => hex([...Array(15).fill(0x30), ...tag, ...Array(256 - 15 - tag.length).fill(0)]);
/** A byte string's bytes (one character a byte). */
const bytesOf = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

/** The keyboard, GetMyClans and the leader's UpdateClanStats over one UiVarManager. */
function page() {
  const r = rig(params);
  const posted: Uint8Array[] = [];
  const clan = new LobbyClan();
  clan.clanId = 12; clan.leader = 7; clan.self = 7; clan.name = 'Tide';
  const roster = new ManageRosterCommands({
    uiVars: r.vars, clan, accountName: () => 'socomc',
    service: { myClans: () => new Promise(() => {}), roster: () => new Promise(() => {}), remove: () => new Promise(() => {}) },
  });
  const service: ManageRosterLeaderService = {
    remove: () => new Promise(() => {}), transferLeadership: () => new Promise(() => {}), disband: () => new Promise(() => {}),
    updateStats: (q) => { posted.push(q.stats); return Promise.resolve({ status: 0 }); },
  };
  const leader = new ManageRosterLeaderCommands({ uiVars: r.vars, clan, roster, service, accountName: () => 'socomc', inputString: () => null });
  const myClans = (tag: number[]): void => {
    const reply: MyClansReply = { status: 0, clanId: 12, clanName: 'Tide', leaderAccountId: 7, leaderAccountName: 'socomc', stats: statsHex(tag), endOfList: true };
    roster.myClansReply(reply);
  };
  /** `clan_tag`'s GetTextInput: the keyboard on Clan_Description, `MPPLAYERNAME`'s caps 3 characters of 15 bytes. */
  const openTag = (): void => {
    expect(r.kb.open(request({ uiVar: 'Clan_Description', skbName: 'CREATEPLAYERNAME', maxChars: 3, maxBytes: 15, noDQuote: false }), 'Clan_Description')).toBe(true);
    for (let i = 0; i < 10; i++) r.kb.tick(STEP, true);
  };
  const closeOut = (): void => { for (let i = 0; i < 20 && r.kb.isOpen; i++) r.kb.tick(STEP, true); };
  const updateClanStats = async (): Promise<Uint8Array> => {
    leader.entries().UpdateClanStats(cmd('UpdateClanStats'), {} as never, undefined);
    await flush();
    return posted[posted.length - 1]!;
  };
  const tagVar = (): string => { const v = r.vars.find('Clan_Description')?.value; return v?.type === 'string' ? v.value : ''; };
  return { r, myClans, openTag, closeOut, updateClanStats, tagVar };
}

describe('LATER 1030 (d): the clan tag held as the original holds it, UTF-8 bytes end to end', () => {
  it('GetMyClans copies the record\'s +15 bytes into Clan_Description as they stand (FUN_002e8bd0 D:L187818)', () => {
    const p = page();
    p.myClans(GUILLEMETS_G);
    expect(bytesOf(p.tagVar())).toEqual(GUILLEMETS_G);
    expect(engineCodes(p.tagVar())).toEqual([0xab, 0x47, 0xbb]);                    // the menus' draw reads «G»
  });

  it.skip(BLOCKED + 'a cancelled CLAN TAG after GetMyClans posts the record\'s tag bytes as they were: C2 AB 47 C2 BB, not a second layer', async () => {
    const p = page();
    p.myClans(GUILLEMETS_G);
    p.openTag();
    press(p.r, 'TRIANGLE');                                                          // ON_SKB_CANCEL, the close, no apply
    p.closeOut();
    expect(p.r.valves.find('skb_done')?.value).toBe(1);
    expect(bytesOf(p.tagVar())).toEqual(GUILLEMETS_G);                             // the cancel leaves the variable
    const stats = await p.updateClanStats();                                        // NetCensorText leaves it too (no lobby here)
    expect(stats.length).toBe(256);
    expect([...stats.subarray(15, 21)]).toEqual([...GUILLEMETS_G, 0]);
  });

  it.skip(BLOCKED + 'two cancelled CLAN TAGs add nothing either: the second post is the same five bytes', async () => {
    const p = page();
    p.myClans(GUILLEMETS_G);
    for (let n = 0; n < 2; n++) { p.openTag(); press(p.r, 'TRIANGLE'); p.closeOut(); }
    await p.updateClanStats();
    const stats = await p.updateClanStats();
    expect([...stats.subarray(15, 21)]).toEqual([...GUILLEMETS_G, 0]);
  });

  // A regression guard only: it passes before and after LATER 1030 (d)'s fix (`TextEncoder` over a typed code-point
  // string is right today), so it does not pin the byte model -- the BLOCKED cases below do.
  it('a tag typed "«G»" on the keyboard posts the same five bytes (a guard: the keyboard path)', async () => {
    const p = page();
    p.openTag();
    for (const cp of [0xab, 0x47, 0xbb]) expect(p.r.kb.insert(cp)).toBe(true);
    p.r.kb.enter();
    p.closeOut();
    const stats = await p.updateClanStats();
    expect([...stats.subarray(15, 21)]).toEqual([...GUILLEMETS_G, 0]);
  });

  it.skip(BLOCKED + 'a typed tag is the variable\'s UTF-8 bytes, as FUN_00399d20 stores it: "É" is C3 89 and the menus\' draw reads 0xC9', () => {
    const p = page();
    p.openTag();
    expect(p.r.kb.insert(0xc9)).toBe(true);
    p.r.kb.enter();
    expect(bytesOf(p.tagVar())).toEqual([0xc3, 0x89]);
    expect(engineCodes(p.tagVar())).toEqual([0xc9]);
  });
});
