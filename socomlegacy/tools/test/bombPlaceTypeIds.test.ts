import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, rdrGet, Zar, type RdrNode } from '@s2u/archive';
import { ElfImage } from '../elfImage';
import { discRoot } from '../dump-dialogs';

/**
 * PARITY-2 PAR-43 (research 214 s9): the type ids `BombPlace`'s ANIMATE commands carry, named off the disc -- the ELF's
 * static type table and `animset.rdr`'s new names. Moved here from `packages/scene/test/bombPlace.parity.test.ts`
 * (which holds the program's decode) because the ELF's reader is the tools package's. The disc resolves through
 * `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; without it every test skips. A reading off the disc.
 */
const DISC = discRoot();
const ELF = DISC ? join(DISC, 'socom2_game.elf') : '';
const READERC = DISC ? join(DISC, 'RUN', 'READERC.ZAR') : '';
const HAVE_ELF = !!DISC && existsSync(ELF) && existsSync(READERC);
/** The type id of `Stand` in the ELF's static type table at 0x661060 (index 1; research 80). */
const STAND_TYPE = 1;

/** `animset.rdr`'s sets, off `RUN/READERC.ZAR` (as the scene test's). */
function animSets(readerc: Uint8Array): RdrNode[] {
  const zar = Zar.parse(readerc);
  const root = parseRdr(zar.data(zar.find('animset.rdr')!));
  const flat = (n: RdrNode): RdrNode[] => (Array.isArray(n) && n.length === 1 && Array.isArray(n[0]) ? flat(n[0]) : n as RdrNode[]);
  return flat(root);
}

describe.skipIf(!HAVE_ELF)(`ANIMATE's type ids, named (the disc's socom2_game.elf and RUN/READERC.ZAR)${HAVE_ELF ? '' : ' -- skipped: no disc tree with socom2_game.elf and RUN/READERC.ZAR'}`, () => {
  it('0x111 is Defusebomb begin, 0x115 Defusebomb end, 1 Stand: the 0x89 static types, then animset.rdr\'s new names in order', () => {
    // The static table: 0x89 names at 0x661060 (`DAT_0066b800 = 0x89` D:L495452; the loop D:L495478-495487, id = index).
    const elf = new ElfImage(new Uint8Array(readFileSync(ELF)));
    const ids = new Map<string, number>();
    for (let i = 0; i < 0x89; i++) ids.set(elf.cstr(elf.u32(0x661060 + 4 * i)), i);
    // `FUN_005e3ff0` per set of animset.rdr, per entry of its anim_set_anims: a type name not yet known takes the next
    // id (D:L496196-496214, from `DAT_0066b800`).
    let next = 0x89;
    for (const set of animSets(new Uint8Array(readFileSync(READERC)))) {
      for (const e of (rdrGet(set, 'anim_set_anims') as RdrNode[] | undefined) ?? []) {
        const t = rdrGet(e, 'type_name');
        if (typeof t === 'string' && !ids.has(t)) ids.set(t, next++);
      }
    }
    const byId = new Map([...ids].map(([k, v]) => [v, k]));
    expect([STAND_TYPE, 0x111, 0x115].map((i) => byId.get(i))).toEqual(['Stand', 'Defusebomb begin', 'Defusebomb end']);
    // The pistol pairs sit between them, in animset.rdr's order (the ELF's strings 0x662000-0x662068, D:L495337-495341).
    expect([0x112, 0x113, 0x114].map((i) => byId.get(i))).toEqual(['Pistol defusebomb begin', 'Defusebomb loop', 'Pistol defusebomb loop']);
  });
});
