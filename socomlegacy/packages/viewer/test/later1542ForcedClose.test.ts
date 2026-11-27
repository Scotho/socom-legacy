import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * LATER 1542 (simulation track; reading, pending review): the START menu's and WEAPON EXCHANGE's forced closes belong to
 * the round's reset, never to a spawn.
 *
 * - The original closes both only inside the HUD reset `FUN_001fb790` (CHUD::ReInit_Uninit, D:L57668-57733): WEAPON
 *   EXCHANGE first (`FUN_00240d50` -> SetState 0, D:L57684; D:L89553-89580), then START (`FUN_00205200` and its clear
 *   `FUN_00202210`, D:L57716-57717). Its two callers are CMission::OnMissionStart `FUN_002a7d40` (D:L149757) and the
 *   unload `FUN_002ac0e0` (D:L151994). OnMissionStart runs it -- online only, under the network byte `DAT_0045a0c1`
 *   (D:L149755) -- immediately BEFORE the round start `FUN_001fb420`
 *   (D:L149758), whose `FUN_00202370` (D:L57616) puts START's cursor on its first row and restarts its open lockout
 *   (D:L61068-61104) -- a close after it would undo that (`FUN_00205200` D:L62207-62208). r0004 keeps the two calls in
 *   that order (`r0004:0x002a98b4` then `r0004:0x002a98c0`; OnMissionStart's twin `r0004:0x002a94f0` is CHANGED, its
 *   HUD calls kept, by the ELF's direct calls); the HUD reset and both closes' twins are unchanged.
 * - The mid-round respawn (CZSealBody::PostMortemPreTick `FUN_00547350` D:L412682-412757, RemoteRespawn `FUN_00598b90`
 *   D:L454977-455344) calls no HUD close: an open menu stays open over a respawn.
 *
 * The port: the round's reset is the match mount's `roundClear` (`./matchNet`: run at `newRound` and `abandoned`, the
 * room's round start and the level left) and, on `/testroom`, `clearAir` (`./armoryGlue`'s `newRound` / `abandoned`);
 * both run only on a room's round events, so a walk with no room never closes here (the online branch's gate). The spawn
 * is `respawned`. Read off the source, as the other hook-line pins do.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf8');

/** The body of `<name>: () => { ... }` in `text`, brace-matched; throws when the hook is absent. */
function hookBody(text: string, name: string): string {
  const head = `${name}: () => {`;
  const at = text.indexOf(head);
  if (at < 0) throw new Error(`no ${name} hook`);
  let depth = 0;
  for (let i = at + head.length - 1; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(at + head.length, i);
  }
  throw new Error(`${name}'s body unclosed`);
}

const PAGES = [
  { file: 'matchMount.ts', round: 'roundClear', exchange: 'exchange.reset()' },
  { file: 'main.ts', round: 'clearAir', exchange: 'exchangePart.reset()' },
] as const;

describe('LATER 1542: the START menu and WEAPON EXCHANGE close at the round\'s reset, not at a spawn (FUN_001fb790 D:L57684, D:L57716-57717)', () => {
  for (const p of PAGES) {
    it(`${p.file}: respawned closes neither (no spawn-path close: FUN_00547350, FUN_00598b90)`, () => {
      const body = hookBody(src(p.file), 'respawned');
      expect(body).not.toContain(p.exchange);
      expect(body).not.toContain('startMenu.reset()');
    });

    it(`${p.file}: ${p.round} closes WEAPON EXCHANGE, then START, both before startMenu.roundStart() (D:L149757 before D:L149758)`, () => {
      const body = hookBody(src(p.file), p.round);
      const ex = body.indexOf(p.exchange), start = body.indexOf('startMenu.reset()'), round = body.indexOf('startMenu.roundStart()');
      expect([ex >= 0, start >= 0, round >= 0]).toEqual([true, true, true]);
      expect(ex).toBeLessThan(start);
      expect(start).toBeLessThan(round);
    });
  }

  // The HUD's reset closes the Chat menu too (`FUN_00235300(menu, 0)` D:L57725, after START): on /testroom's `clearAir` the
  // TAUNTS menu's close (`taunts.reset()`; the match mount's is LATER 1525's). The menu's close only: ending a held talk
  // at it is R4P-318's, not claimed here.
  it('main.ts: clearAir closes TAUNTS after START and before startMenu.roundStart(); respawned does not (D:L57725)', () => {
    const main = src('main.ts');
    const round = hookBody(main, 'clearAir');
    const t = round.indexOf('taunts.reset()');
    expect(t).toBeGreaterThan(round.indexOf('startMenu.reset()'));
    expect(t).toBeLessThan(round.indexOf('startMenu.roundStart()'));
    expect(hookBody(main, 'respawned')).not.toContain('taunts.reset()');
  });
});
