import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, Zar } from '@s2u/archive';
import { parseLocTable, UIMNLOC } from '@s2u/scene';
import { CARD_PROMPT_CAPTIONS, LIST_ICO_BYTES_READING } from '@s2u/ui';
import { discRoot } from '../dump-dialogs';
import { readCardPromptPin, readCardPromptSets } from '../cardPromptCommands';

/**
 * OPT-05i's dev-disc check (web research 143; W6.R8): the card prompts' animations re-derived from the disc --
 * `RUN/UIZANIM.ZAR`'s sets decoded with `decodeUiSet`, the walk from the three entries -- equal to
 * `cardPromptCommands.pinned.json`, each with no unknown command; every animation of `UIMemCardAnim.rdr` decodes with
 * none (the 26, not only the path's); the captions' ids are the messages `UIMnLOC.rdr` names; `LIST.ICO`'s size is the
 * reading. Regenerate with `npx tsx tools/cardPromptCommands.ts --pin` and say in research 143 what moved. The disc
 * resolves through `SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`; with neither (CI) it skips.
 */
const DISC = discRoot();
const PIN = resolve(import.meta.dirname, 'cardPromptCommands.pinned.json');

describe.skipIf(!DISC)('the card prompts off the disc (SOCOM_DISC / SOCOM_PC_ROOT)', () => {
  it('equal the pin, animation by animation, none with an unknown command', () => {
    const pinned = JSON.parse(readFileSync(PIN, 'utf8'));
    const now = JSON.parse(JSON.stringify(readCardPromptPin(DISC!)));
    expect(now.entries).toEqual(pinned.entries);
    expect(now.animations.length).toBe(pinned.animations.length);
    now.animations.forEach((a: { key: string; unknown: string[] }, i: number) => {
      expect(a, a.key).toEqual(pinned.animations[i]);
      expect(a.unknown, a.key).toEqual([]);
    });
    expect(now.names).toEqual(pinned.names);
  }, 300_000);

  it('every animation of UIMemCardAnim.rdr decodes with no unknown command (26)', async () => {
    const { unknownOf } = await import('../cardPromptCommands');
    const set = readCardPromptSets(DISC!).find((s) => s.name === 'UIMemCardAnim.rdr')!;
    expect(set.programs.size).toBe(26);
    for (const [name, program] of set.programs) expect(unknownOf(program), name).toEqual([]);
  }, 300_000);

  it('the captions\' ids are the messages UIMnLOC.rdr names', () => {
    const z = Zar.parse(new Uint8Array(readFileSync(resolve(DISC!, UIMNLOC.archive))));
    const key = z.find(UIMNLOC.member)!;
    const table = new Map(parseLocTable(parseRdr(z.data(key))).map((e) => [e.id, e.msg]));
    for (const [id, msg] of Object.entries(CARD_PROMPT_CAPTIONS)) expect(table.get(Number(id)), id).toBe(msg);
  });

  it('RUN/ICONS/LIST.ICO, the source MC_CreateIconFiles copies, is LIST_ICO_BYTES_READING long', () => {
    expect(statSync(resolve(DISC!, 'RUN/ICONS/LIST.ICO')).size).toBe(LIST_ICO_BYTES_READING);
  });
});
