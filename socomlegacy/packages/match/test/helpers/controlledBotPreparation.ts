import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';
import { MatchBots } from '../../src/bots/matchBots';

/** Synthetic service fixture: force the real asynchronous request path, then control only its expensive factory. */
export function controlledBotPreparation(navigationDir: string) {
  writeFileSync(join(navigationDir, 'MP2.json'), JSON.stringify({ version: 2, map: 'MP2', nodes: [{ at: [0, 0, 0], edges: [0], component: 0 }] }));
  let controller: MatchBots | undefined;
  let resolve!: (value: MatchBots) => void;
  const pending = new Promise<MatchBots>((done) => { resolve = done; });
  let began!: () => void;
  const started = new Promise<void>((done) => { began = done; });
  const prepare = vi.spyOn(MatchBots, 'prepare').mockImplementation((room) => {
    controller = new MatchBots(room);
    began();
    return pending;
  });
  return { started, prepare, controller: () => controller!, finish: () => resolve(controller!) };
}
