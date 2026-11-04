import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, rdrGet, Zar, type RdrNode } from '@s2u/archive';
import { discRoot } from '../dump-dialogs';

/**
 * LATER 504 (research 215 §8.5; a disc reading): the rows a stand press from crouch pushes (`FUN_00581c10` D:L442635-442640:
 * "Walk", type 2, moving; "Stand -> Crouch", 0x11, still) resolve under neither the "launcher anim set" nor the GLOBAL set it
 * includes -- so under the launcher set the press pushes nothing (`FUN_00588bc0` D:L446078-446080) and the body stays on its
 * "Crouch" row. Off `RUN/READERC.ZAR`'s `animset.rdr` (`SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`); skipped without it.
 */
const DISC = discRoot();
const READERC = DISC ? join(DISC, 'RUN', 'READERC.ZAR') : '';
const HAVE = !!DISC && existsSync(READERC);

function rowsOf(name: string): string[] {
  const zar = Zar.parse(new Uint8Array(readFileSync(READERC)));
  const root = parseRdr(zar.data(zar.find('animset.rdr')!));
  const flat = (n: RdrNode): RdrNode[] => (Array.isArray(n) && n.length === 1 && Array.isArray(n[0]) ? flat(n[0]) : n as RdrNode[]);
  const set = flat(root).find((s) => rdrGet(s, 'anim_set_name') === name);
  return ((rdrGet(set!, 'anim_set_anims') as RdrNode[] | undefined) ?? []).map((e) => String(rdrGet(e, 'type_name')));
}

describe.skipIf(!HAVE)(`LATER 504: the launcher set's rows (animset.rdr)${HAVE ? '' : ' -- skipped: no disc tree with RUN/READERC.ZAR'}`, () => {
  it('the launcher set has 7 rows, its "Crouch" among them; neither it nor GLOBAL (110 rows) has "Walk" or "Stand -> Crouch"', () => {
    const launcher = rowsOf('launcher anim set'), global = rowsOf('GLOBAL');
    expect(launcher).toHaveLength(7);
    expect(global).toHaveLength(110);
    expect(launcher).toContain('Crouch');
    for (const row of ['Walk', 'Stand -> Crouch', 'Stand']) {
      expect(launcher, row).not.toContain(row);
      expect(global, row).not.toContain(row);
    }
  });
});
