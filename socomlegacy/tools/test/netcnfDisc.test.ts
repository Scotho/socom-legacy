import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NETCNF_ATTACH_CONTENTS_READING, NETCNF_DIR, NETCNF_FILES, NETCNF_INDEX_PATH } from '../../packages/card/src/netcnf';

/**
 * ONL-01a's names against the retail disc (research 136 §1), dev host only: the card layout `netcnf.ts` writes is the
 * one the game's own netcnf module names (`RUN/IRX/NETCNF.IRX`'s strings), the two icons are the disc's own files at
 * the sizes the card lists, and the device the attachment reading holds is the disc's `DEV002.CNF`. The disc tree is
 * `SOCOM_DISC`; without it this skips (CI has none). Nothing of the disc is copied: names and sizes only (RS.R8).
 */
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : '';
const HAVE = DISC !== '' && existsSync(join(DISC, 'RUN', 'IRX', 'NETCNF.IRX'));

const sizeOf = (name: string): number => NETCNF_FILES.find((f) => f.name === name)!.size;

describe.skipIf(!HAVE)('the configuration\'s names and sizes against the disc (SOCOM_DISC)', () => {
  it('NETCNF.IRX names the folder, the index, the files\' patterns, the index line and the icons', () => {
    const text = readFileSync(join(DISC, 'RUN', 'IRX', 'NETCNF.IRX')).toString('latin1');
    // The index line ends on a line feed, as `netCnfIndexText` writes it.
    for (const s of [NETCNF_INDEX_PATH, NETCNF_DIR, '%snet%03d%s', '%sifc%03d%s', '%sdev%03d%s', '%d,%d,%s,%s\n', '.cnf', '.dat', 'SYS_NET.ICO', 'icon.sys']) {
      expect(text.includes(`${s}\0`), s).toBe(true);
    }
    // EZNETCNF.IRX, the module the game's NetCnfOpen calls, reads through it.
    const ez = readFileSync(join(DISC, 'RUN', 'IRX', 'EZNETCNF.IRX')).toString('latin1');
    for (const s of ['sceNetCnfGetCount', 'sceNetCnfGetList', 'sceNetCnfLoadEntry', 'getDisplayName', 'getCombinationList']) {
      expect(ez.includes(s), s).toBe(true);
    }
  });

  it('the icons are the disc\'s CNF/SYS_NET.ICO and CNF/ICON.SYS, at the sizes the card lists', () => {
    expect(statSync(join(DISC, 'CNF', 'SYS_NET.ICO')).size).toBe(sizeOf('SYS_NET.ICO'));
    expect(statSync(join(DISC, 'CNF', 'ICON.SYS')).size).toBe(sizeOf('icon.sys'));
  });

  it('the device is the disc\'s DEV002.CNF, its vendor and product the HARDWARE line', () => {
    // The disc's files end their lines on CR LF; compared line by line.
    const dev = readFileSync(join(DISC, 'DEV002.CNF'), 'latin1').replace(/\r\n/g, '\n');
    const { dev: d } = NETCNF_ATTACH_CONTENTS_READING;
    expect(dev).toContain(`type ${d.type}\n`);
    expect(dev).toContain(`vendor "${d.vendor}"\n`);
    expect(dev).toContain(`product "${d.product}"\n`);
    expect(dev).toContain(`phy_config ${d.phy_config}\n`);
    // The disc's NET003 pair is generic Ethernet (IFC003 `type eth`); the NET005 pair (IFC005 `type nic` with DEV002's
    // vendor SCE) is ours. The game never writes an interface config: it reads net003/net005 from the disc or
    // net_ex.cnf from the card (D:L210469-210489).
    const eth = readFileSync(join(DISC, 'IFC003.CNF'), 'latin1').replace(/\r\n/g, '\n');
    expect(eth).toContain('type eth\n');
    const ifc = readFileSync(join(DISC, 'IFC005.CNF'), 'latin1').replace(/\r\n/g, '\n');
    expect(ifc).toContain(`type ${NETCNF_ATTACH_CONTENTS_READING.ifc.type}\n`);
    expect(ifc).toContain('dhcp\n');
  });
});
