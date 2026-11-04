import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar } from '@s2u/archive';
import { decodeUiProgram, parseAnimSets, parseUiLayout, UI_VALVE_OPS, type UiOp, type UiToken } from '@s2u/scene';
import { bindingsOf, DIALOG_ARCHIVES, SET_ARCHIVES, screenRoot } from '../dialogInventory';
import { discRoot } from '../dump-dialogs';

/**
 * ONL-34's dev-disc check (web research 269 §4.1-§4.3): the medal of merit's two sets' ops, read off the disc with the
 * repository's readers (`Zar`, `parseRdr`, `parseUiLayout`, `parseAnimSets`, `decodeUiProgram`) -- names, node names
 * and the ops as decoded, no bytes (RS.R8):
 * - the sixteen dialogs whose `playername` (PLAYER_NAME_AND_TAG) has the five medal images as its children; fifteen
 *   bind `ActivateMedalOfMerit` at ONSTART, the sixteenth (`dlgWorldOfSOCOM`) its own `DisplayMedalOfMerit` on
 *   ON_LADDER_REFRESH, and no other binding names either;
 * - `UIanim.rdr`'s `ActivateMedalOfMerit` (the same ops in each archive that holds a copy) and SOCOM II ONLINE's
 *   `DisplayMedalOfMerit`: each IF / ELSEIF a valve test of `LadderMedalOfMerit` by name, its operation byte 2 --
 *   equality in `FUN_00353fd0`'s switch (D:L252181, case 2 at D:L252188-252189) -- against 1..5;
 * - every `GetLadderInfo` the three archives' sets carry, with its mode word (+0x10): the modes that ask my position
 *   (0 `FUN_002eb2c0`, 1 `FUN_002eafb0`, any above 11 the default, `FUN_002784d0` D:L123419-123425, D:L123488-123489)
 *   stand only in SOCOM II ONLINE's and PLAYER RANKING's ONSTART -- the decompiled text's only callers of the two
 *   (D:L123420, D:L123424, D:L123489). The disc resolves through `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; with
 *   neither it skips.
 */
const DISC = discRoot();
const zar = (p: string): Zar => Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, p))));
const MEDAL_NODES = ['Medal_Blue', 'Medal_Bronze', 'Medal_Silver', 'Medal_Gold', 'Medal_Black'];

const tokenLine = (t: UiToken): string => (t.t === 'valve' ? `${t.valve} ${t.op} ${typeof t.operand === 'number' ? t.operand : t.operand.valve}` : t.t);
/** An op as one line: SHOW / HIDE a node, IF / ELSEIF its tokens, ENDIF; anything else by its kind. */
const opLine = (o: UiOp): string => {
  if (o.op === 'active') return `${o.on ? 'SHOW' : 'HIDE'} ${o.node}`;
  if (o.op === 'if' || o.op === 'elseif') return `${o.op.toUpperCase()} ${o.tokens.map(tokenLine).join(' ')}`;
  if (o.op === 'endif') return 'ENDIF';
  if (o.op === 'ui') return `${o.command.fn ?? `${o.command.node}.op${o.command.op}`}(${o.command.arg})`;
  return o.op;
};

/** The animation `name` of every set called `set` in the three archives, decoded, with its raw commands. */
function programs(set: string, name: string) {
  const out: { archive: string; ops: string[]; raw: { set: number; cmd: number; bytes: Uint8Array }[] }[] = [];
  for (const archive of SET_ARCHIVES) {
    for (const s of parseAnimSets(zar(archive)).sets) {
      if (s.name.toLowerCase() !== set.toLowerCase()) continue;
      for (const a of s.anims) {
        if (a.name !== name) continue;
        out.push({ archive, ops: decodeUiProgram(a).sequences.flatMap((q) => q.ops.map(opLine)), raw: a.sequences.flatMap((q) => q.commands.map((c) => ({ set: c.set, cmd: c.cmd, bytes: c.bytes }))) });
      }
    }
  }
  return out;
}

/** The valve tests' operation and flag bytes in a program's IF / ELSEIF commands (the token at +8: its +12 and +13). */
function valveTestBytes(raw: { set: number; cmd: number; bytes: Uint8Array }[]): { op: number; flags: number; operand: number }[] {
  return raw.filter((c) => c.set === 0 && (c.cmd === 2 || c.cmd === 3)).map((c) => {
    const v = new DataView(c.bytes.buffer, c.bytes.byteOffset, c.bytes.byteLength);
    return { op: c.bytes[8 + 12]!, flags: c.bytes[8 + 13]!, operand: v.getInt32(8 + 8, true) };
  });
}

const BRANCHES = [
  'IF LadderMedalOfMerit == 1', 'SHOW Medal_Blue', 'ELSEIF LadderMedalOfMerit == 2', 'SHOW Medal_Bronze', 'ELSEIF LadderMedalOfMerit == 3', 'SHOW Medal_Silver',
  'ELSEIF LadderMedalOfMerit == 4', 'SHOW Medal_Gold', 'ELSEIF LadderMedalOfMerit == 5', 'SHOW Medal_Black', 'ENDIF',
];

describe.skipIf(!DISC)('the medal of merit off the disc (SOCOM_DISC / SOCOM_PC_ROOT)', () => {
  it('sixteen dialogs carry playername with the five medals; fifteen bind ActivateMedalOfMerit at ONSTART, SOCOM II ONLINE DisplayMedalOfMerit on ON_LADDER_REFRESH', () => {
    const withMedals: string[] = [], bindings: string[] = [];
    for (const archive of DIALOG_ARCHIVES) {
      const z = zar(archive);
      for (const k of z.root.children) {
        if (!/^dlg.*\.rdr$/i.test(k.name)) continue;
        const root = parseRdr(z.data(k));
        let layout: ReturnType<typeof parseUiLayout>;
        try { layout = parseUiLayout(screenRoot(root)); } catch { continue; }
        const all = [...layout.objects, ...layout.controls];
        const name = all.find((o) => o.name === 'playername');
        const kids = all.filter((o) => o.parent === 'playername' && o.name !== 'playername');
        if (name && kids.length > 0) {
          expect([name.type, name.uivar], k.name).toEqual(['WRAPPEDTEXT', 'PLAYER_NAME_AND_TAG']);
          expect(kids.map((o) => `${o.type} ${o.name} ${o.filename}`), k.name).toEqual(MEDAL_NODES.map((n) => `IMAGE ${n} ${n}.tif`));
          withMedals.push(k.name);
        }
        for (const b of bindingsOf(root)) if (/MedalOfMerit/.test(b.animation)) bindings.push(`${k.name} ${b.owner} ${b.trigger} -> ${b.animation}`);
      }
    }
    const fifteen = [
      'dlgClanLadderLobby.rdr', 'dlgCreateClan.rdr', 'dlgCreateGame.rdr', 'dlgFriendList.rdr', 'dlgIgnoreList.rdr', 'dlgInvitedPlayers.rdr', 'dlgLadderLobby.rdr',
      'dlgManageRoster.rdr', 'dlgManageRosterLeader.rdr', 'dlgMPBriefingRoom.rdr', 'dlgOnlineFilters.rdr', 'dlgOnlineOptions.rdr', 'dlgRespondToInvites.rdr',
      'dlgSetSOP.rdr', 'dlgSetTaunts.rdr',
    ];
    expect(withMedals.sort()).toEqual([...fifteen, 'dlgWorldOfSOCOM.rdr'].sort());
    expect(bindings.sort()).toEqual([
      ...fifteen.map((d) => `${d} SCREEN EVENT ONSTART -> ActivateMedalOfMerit`), 'dlgWorldOfSOCOM.rdr SCREEN EVENT ON_LADDER_REFRESH -> DisplayMedalOfMerit',
    ].sort());
    expect(withMedals).not.toContain('dlgGameLobby.rdr');
  }, 300_000);

  it('UIanim.rdr\'s ActivateMedalOfMerit: the five hidden, then IF / ELSEIF LadderMedalOfMerit == 1..5 SHOW Medal_Blue .. Medal_Black -- the same in every archive\'s copy', () => {
    const copies = programs('UIanim.rdr', 'ActivateMedalOfMerit');
    expect(copies.map((c) => c.archive)).toContain('RUN/UIZANIM.ZAR');
    for (const c of copies) {
      expect(c.ops, c.archive).toEqual(['HIDE Medal_Black', 'HIDE Medal_Gold', 'HIDE Medal_Silver', 'HIDE Medal_Bronze', 'HIDE Medal_Blue', ...BRANCHES]);
      expect(valveTestBytes(c.raw), c.archive).toEqual([1, 2, 3, 4, 5].map((operand) => ({ op: 2, flags: 2, operand })));
    }
    expect(UI_VALVE_OPS[2]).toBe('==');
  }, 300_000);

  it('SOCOM II ONLINE\'s DisplayMedalOfMerit: the same five branches, no HIDE first; its get_ladder_top_10 hides the five and asks GetLadderInfo twice', () => {
    const [own] = programs('dlgWorldOfSOCOM.rdr', 'DisplayMedalOfMerit');
    expect(own!.ops).toEqual(BRANCHES);
    expect(valveTestBytes(own!.raw)).toEqual([1, 2, 3, 4, 5].map((operand) => ({ op: 2, flags: 2, operand })));
    const [start] = programs('dlgWorldOfSOCOM.rdr', 'get_ladder_top_10');
    expect(start!.ops).toEqual(['HIDE Medal_Black', 'HIDE Medal_Gold', 'HIDE Medal_Silver', 'HIDE Medal_Bronze', 'HIDE Medal_Blue', 'GetLadderInfo(NA)', 'GetLadderInfo(NA)']);
  }, 300_000);

  it('every GetLadderInfo on the disc, with its mode: my position is asked only by SOCOM II ONLINE\'s ONSTART (1) and PLAYER RANKING\'s (0)', () => {
    const sites: string[] = [];
    for (const archive of SET_ARCHIVES) {
      for (const s of parseAnimSets(zar(archive)).sets) {
        for (const a of s.anims) {
          for (const op of decodeUiProgram(a).sequences.flatMap((q) => q.ops)) {
            const commands = op.op === 'ui' ? [op.command] : op.op === 'if' || op.op === 'elseif' || op.op === 'while' ? op.tokens.flatMap((t) => (t.t === 'ui' ? [t.command] : [])) : [];
            for (const c of commands) if (c.fn === 'GetLadderInfo') sites.push(`${s.name}/${a.name} ${c.extra[0] ?? 0}`);
          }
        }
      }
    }
    expect(sites).toEqual([
      'dlgWorldOfSOCOM.rdr/get_ladder_top_10 1', 'dlgWorldOfSOCOM.rdr/get_ladder_top_10 7',
      'dlgLadderLobby.rdr/get_ladder_top_10 0', 'dlgLadderLobby.rdr/ladder_up 2', 'dlgLadderLobby.rdr/ladder_up 4', 'dlgLadderLobby.rdr/ladder_down 3',
      'dlgLadderLobby.rdr/ladder_down 5', 'dlgLadderLobby.rdr/RefreshArrows 3', 'dlgLadderLobby.rdr/RefreshArrows 2',
      'dlgClanLadderLobby.rdr/get_ladder_top_10 6', 'dlgClanLadderLobby.rdr/ladder_up 8', 'dlgClanLadderLobby.rdr/ladder_up 10', 'dlgClanLadderLobby.rdr/ladder_down 9',
      'dlgClanLadderLobby.rdr/ladder_down 11', 'dlgClanLadderLobby.rdr/RefreshArrows 9', 'dlgClanLadderLobby.rdr/RefreshArrows 8',
    ]);
    const asks = sites.filter((l) => { const m = Number(l.split(' ')[1]); return m === 0 || m === 1 || m > 11; });
    expect(asks).toEqual(['dlgWorldOfSOCOM.rdr/get_ladder_top_10 1', 'dlgLadderLobby.rdr/get_ladder_top_10 0']);
  }, 300_000);
});
