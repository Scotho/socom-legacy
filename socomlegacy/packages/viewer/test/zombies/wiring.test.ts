import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// The test room's wiring of the zombies mode (`TEST_ROOM_ZOMBIES_ADAPTATION`, OT.R70), pinned on main.ts's text: the
// page's match is `net`, so `inMatch` is true in every match -- the online test room's among them -- and a zombies run
// can never start with other players in (the #395 review's ask 2; the merge controller's pin).
const main = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');

it('every match the page makes is held in `net`, and inMatch reads it', () => {
  const made = main.match(/new NetPage\(/g) ?? [];
  const held = main.match(/\bnet = new NetPage\(/g) ?? [];
  expect(made.length).toBeGreaterThanOrEqual(4);     // replay (two), the server's room, the offline loopback
  expect(held.length).toBe(made.length);
  // #395 review F1 (b): networked matches only -- the offline loopback (`solo`) is stood down at a start and made again
  // at F7, through the one teardown connectNet uses (`leaveRoom`)
  expect(main).toContain('inMatch: () => net !== null && solo === null,');
  // the re-read's R1: the map-entry ARMORY's pending offline room (`soloAfterArmory`) counts as the loopback too -- a
  // start under the ARMORY stands it down (leaveRoom clears it) and closes the ARMORY, so it is never made beside the run
  // the re-read's low note: a start during a mod Reload map's load (the ARMORY's reopen pending, `reopenArmory`) clears
  // that reopen too, so the ARMORY never opens over the run
  expect(main).toContain('offline: { active: () => solo !== null || soloAfterArmory !== null, stop: () => { leaveRoom(); reopenArmory = false; armory.close(); ears.stop(); showOnline(); }, restore: () => { if (loaded) connectNet(loaded); } },');
  expect(main).toMatch(/function leaveRoom\(\): void \{/);
  const connect = main.slice(main.indexOf('function connectNet(map: LoadedMap): void {'), main.indexOf('function connectNet(map: LoadedMap): void {') + 800);
  expect(connect).toContain('leaveRoom();');
});

it('a replay frame mounts no zombies (ask 5), and a map load resets only a mounted mode', () => {
  expect(main).toContain('const zombieDeath = REPLAY_WORLD ? null : new ZombieDeath(fly.camera);');
  expect(main).toContain('const zombies = zombieDeath && installZombies({');
  expect(main).toContain('  zombies?.reset({ restore: false });');   // F1 (b): the map load makes its own room
  expect(main).not.toMatch(/^\s*zombies\.reset\(/m);
});
