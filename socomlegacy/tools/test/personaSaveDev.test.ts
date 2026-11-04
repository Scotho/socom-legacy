import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parsePersonaFile, type PersonaRecord } from '@s2u/card';
import { readCardFile, readSaveFile, saveModules, type Persona } from '../cardFile';
import { page, saveAndLeave, type Page } from '../../packages/viewer/test/optionsSaveRig';

/**
 * OPT-04's dev-host variant (roadmap 04 OPT-04 under R7: "a second persona appended as the original appends it (the one-
 * and two-persona fixtures' field values, read once with the dev tool under `tools/`)"; research 229 §5): the page's
 * whole options save (OPT-01's rig, `optionsSaveRig.ts`) against the recomp's fixture save files
 * `$SOCOM_PC_ROOT/third_party/ps2recomp/ps2xTest/fixtures/cards/{one,two}.bin` (on the host, never in this tree), read
 * through `tools/cardFile.ts`: each record's fields, their order, the file's size and its modules' order. The passwords
 * are credentials (RS.R8): never compared, printed or copied; the page writes none, at most SAVEPASSWORD and a length (OT.R61). Without `SOCOM_PC_ROOT`, or
 * without the fixtures, every test skips: a skip, not a pass. The reading level: the fixtures are a recomp run's.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const CARDS = PC_ROOT ? join(PC_ROOT, 'third_party', 'ps2recomp', 'ps2xTest', 'fixtures', 'cards') : '';
const HAVE = PC_ROOT !== null && ['one.bin', 'two.bin'].every((f) => existsSync(join(CARDS, f)));

const bytes = (f: string): Uint8Array => new Uint8Array(readFileSync(join(CARDS, f)));

/** A fixture persona's fields as the page writes them: all but PASSWORD and SAVEPASSWORD (below). */
const fields = (p: Persona) => ({
  HOST: p.host, NAME: p.name, TOWN: p.town, GENDER: p.gender, PORT: p.port,
  PROFILES: { PROFILE_CHECKSUM: p.profileChecksum, PROFILE_INFO: p.profileInfo },
});
const written = (r: PersonaRecord) => ({ HOST: r.HOST, NAME: r.NAME, TOWN: r.TOWN, GENDER: r.GENDER, PORT: r.PORT, PROFILES: r.PROFILES });

/** `dlgNetLogin.rdr`'s ten persistent UI variables: the fixtures were saved after the game had been online (R102.9). */
function online(t: Page): void {
  for (let n = 1; n <= 5; n++) {
    t.uiVars.add(`MPLOCALSOP${n}`, { type: 'string', value: `SOP ${n}` }, 3);
    t.uiVars.add(`MPTAUNTMSG${n}`, { type: 'string', value: `TAUNT ${n}` }, 3);
  }
}
const login = (t: Page, p: Persona): void => t.db.update(p.host, p.port, p.name, null, p.town, p.gender, p.savePassword);
const records = (t: Page): PersonaRecord[] => {
  const r = parsePersonaFile(t.saveFile().data);
  if (!r.ok) throw new Error(r.reason);
  return r.personas;
};

describe.skipIf(!HAVE)('OPT-04: the page\'s whole save against the one- and two-persona fixtures (SOCOM_PC_ROOT)', () => {
  it('CAcctDB holds AcctInfo alone on both cards (persona.ts SAVE_FILE_MODULES), as the page writes it', () => {
    for (const f of ['one.bin', 'two.bin']) {
      const acct = saveModules(readSaveFile(bytes(f))).find((m) => m.name === 'CAcctDB');
      expect(acct?.children.map((c) => c.name), f).toEqual(['AcctInfo.rdr']);
    }
    const t = page();
    saveAndLeave(t);
    expect(Object.keys((t.saveFile().data as { CAcctDB: object }).CAcctDB)).toEqual(['AcctInfo']);
  });

  it('one.bin: its one record\'s fields, its size and its modules\' order, through the page\'s save', () => {
    const one = readCardFile(bytes('one.bin'));
    expect(one).toHaveLength(1);
    const t = page();
    online(t);
    login(t, one[0]!);
    saveAndLeave(t);
    expect(records(t).map(written)).toEqual(one.map(fields));
    expect(t.saveFile().size).toBe(statSync(join(CARDS, 'one.bin')).size);
    expect(Object.keys(t.saveFile().data as object)).toEqual(saveModules(readSaveFile(bytes('one.bin'))).map((m) => m.name));
    // The fixture's SAVE PASSWORD is YES, and the page's record keeps it (OT.R61, FUN_002fc440 D:L199266); the login here
    // hands no password (the fixture's is a credential, never read: RS.R8), so the length is 0, as D:L199263 writes none.
    expect(one[0]!.savePassword).toBe(1);
    expect(records(t).map((r) => [r.SAVEPASSWORD, r.PASSWORD])).toEqual([[1, { length: 0 }]]);
  });

  it('two.bin: the second persona appended after the first, across LoadConfig and a second save -- its records in its order, its size', () => {
    const two = readCardFile(bytes('two.bin'));
    expect(two).toHaveLength(2);
    const t = page();
    online(t);
    login(t, two[0]!);
    saveAndLeave(t);
    expect(t.config.restore(t.saveFile().data)).toBe(true);
    login(t, two[1]!);
    saveAndLeave(t);
    expect(records(t).map(written)).toEqual(two.map(fields));
    expect(t.saveFile().size).toBe(statSync(join(CARDS, 'two.bin')).size);
    expect(Object.keys(t.saveFile().data as object)).toEqual(saveModules(readSaveFile(bytes('two.bin'))).map((m) => m.name));
  });
});
