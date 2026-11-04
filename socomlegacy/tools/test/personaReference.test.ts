import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readCardFile, type Persona } from '../cardFile';
import { FIXTURE_FILE_SIZES, ONE_BIN_PERSONAS, TWO_BIN_PERSONAS } from '../../packages/card/test/personaReference';

/**
 * OPT-04a's reference (research 135 §2), dev host only: the one- and two-persona fixtures, read with the card file
 * reader, still decode to the records `packages/card/test/personaReference.ts` pins -- each field as R7 keeps it, the
 * password as its length (never compared or printed as itself) -- and the three cards' sizes are the nominal sizes the
 * persona store writes. The fixtures live in the PC project (`SOCOM_PC_ROOT`), never in this tree; without them it
 * skips (CI has neither).
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const CARDS = PC_ROOT ? join(PC_ROOT, 'third_party', 'ps2recomp', 'ps2xTest', 'fixtures', 'cards') : '';
const FILES = ['virgin.bin', 'one.bin', 'two.bin'];
const HAVE = PC_ROOT !== null && FILES.every((f) => existsSync(join(CARDS, f)));

/** A decoded persona as the R7 record holds it (the password's length in place of the password). */
const asRecord = (p: Persona) => ({
  HOST: p.host, NAME: p.name, TOWN: p.town, GENDER: p.gender, PORT: p.port, PASSWORD: { length: p.password.length },
  SAVEPASSWORD: p.savePassword,
  PROFILES: { PROFILE_CHECKSUM: p.profileChecksum, PROFILE_INFO: p.profileInfo.map(() => 'item') },
});

describe.skipIf(!HAVE)('the persona reference, read from the fixtures (ps2xTest/fixtures/cards)', () => {
  it('one.bin and two.bin decode to the pinned records; virgin.bin to none', () => {
    const read = (f: string) => readCardFile(new Uint8Array(readFileSync(join(CARDS, f)))).map(asRecord);
    expect(read('virgin.bin')).toEqual([]);
    expect(read('one.bin')).toEqual(ONE_BIN_PERSONAS);
    expect(read('two.bin')).toEqual(TWO_BIN_PERSONAS);
  });

  it('the three files\' sizes are the pinned nominal sizes, by persona count', () => {
    expect(FILES.map((f) => statSync(join(CARDS, f)).size)).toEqual(FIXTURE_FILE_SIZES);
  });
});
