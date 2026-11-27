// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { parseTextureRecord } from '@s2u/gs';
import { RETICLE_SET_TEXTURES } from '../src/hudBitmaps';

/**
 * B-77 (dev-disc): every multiplayer map's `HUD2_TXR.ZED` reticle records ask for bilinear sampling -- the filter the
 * sprite's draw takes from the record's own bind packet (`FUN_003643b0` D:L261666, no TEX1 of its own D:L261673-261674).
 * Read through the repository's reader (`parseTextureRecord(...).gs`), and the raw words of the same packet held whole,
 * because the reader answers bilinear for an ABSENT TEX1 and REPEAT for an ABSENT CLAMP (`@s2u/gs` `decodeGsState`; the
 * review's F1): TEX1_1 (register 0x14) present and 0x60 (MMAG bit 5 and MMIN bits 6-8 = 1: linear, no mipmaps), and
 * CLAMP_1 (register 0x08) present and 0 (WMS = WMT = REPEAT). The maps are no fixtures: this file reads
 * `SOCOM_DISC` (or `SOCOM_PC_ROOT`'s `game/disc`) and SKIPS without them -- a skip is said, never a pass.
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP2.ZDB')));
const SKIP = DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT with RUN/MP2 absent -- skipped (no fixtures)';

/** A GS register's value (`register`: 0x14 TEX1_1, 0x08 CLAMP_1) in a record's 9-quadword bind packet after its pixels, or null. */
function packetWord(texdat: Uint8Array, size: number, register: bigint): bigint | null {
  const v = new DataView(texdat.buffer, texdat.byteOffset, texdat.byteLength);
  const at = 32 + size;
  for (let o = at; o + 16 <= Math.min(at + 144, texdat.length); o += 16) {
    if ((v.getBigUint64(o + 8, true) & 0xffn) === register) return v.getBigUint64(o, true);
  }
  return null;
}

describe.skipIf(!DISC)(`B-77: the reticle records' filter on every MP map${SKIP}`, () => {
  it('every RETICLE_SET_TEXTURES record: gs.bilinear and REPEAT, TEX1_1 present and 0x60, CLAMP_1 present and 0', () => {
    const stems = readdirSync(join(DISC!, 'RUN')).filter((f) => /^MP\d+\.ZDB$/i.test(f)).sort();
    expect(stems.length).toBeGreaterThan(0);
    const rows: string[] = [];
    let records = 0;
    for (const file of stems) {
      const b = new Uint8Array(readFileSync(join(DISC!, 'RUN', file)));
      const txr = Zar.parse(zdbMember(b, parseZdb(b), 'HUD2_TXR.ZED'));
      const keys = txr.find('textures')?.children ?? [];
      for (const name of RETICLE_SET_TEXTURES) {
        const key = keys.find((k) => k.name.toLowerCase() === name);
        const child = key ? txr.child(key, 'texdat') : undefined;
        if (!key || !child) { rows.push(`${file} ${name}: absent`); continue; }
        const bytes = txr.data(child);
        const rec = parseTextureRecord(name, bytes);
        const tex1 = packetWord(bytes, rec.size, 0x14n), clamp = packetWord(bytes, rec.size, 0x08n);
        records++;
        const ok = rec.gs?.bilinear === true && rec.gs.wrapS === 'repeat' && rec.gs.wrapT === 'repeat' && tex1 === 0x60n && clamp === 0n;
        if (!ok) rows.push(`${file} ${name}: bilinear ${rec.gs?.bilinear} wrap ${rec.gs?.wrapS}/${rec.gs?.wrapT} TEX1 ${tex1 === null ? 'absent' : `0x${tex1.toString(16)}`} CLAMP ${clamp === null ? 'absent' : `0x${clamp.toString(16)}`}`);
      }
    }
    expect(rows).toEqual([]);
    expect(records).toBe(stems.length * RETICLE_SET_TEXTURES.length);
  });
});
