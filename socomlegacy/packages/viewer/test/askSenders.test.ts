import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * LATER 116 (ASK_AT_COMMAND_ADAPTATION, `packages/match/src/room.ts`): the room now refuses a `door`, `action`,
 * `bombAction` or `pickup` without a whole `seq` ('shape'). The page's senders always send one -- `NetClient.lastSeq()`,
 * which starts at 0 (before the first command: a whole number) and only ever steps by one or takes the room's own seq --
 * so the new refusal never hits an honest page. A scan of the sources, as `flyAccess.test.ts` scans the specs.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (rel: string): string => readFileSync(resolve(SRC, rel), 'utf8');

describe('LATER 116: the page sends every immediate ask with a whole seq', () => {
  it.each([
    ['doorPage.ts', /net\.send\(\{ type: 'door', seq: net\.lastSeq\(\), door: /],
    ['actionPage.ts', /net\.send\(\{ type: 'action', seq: net\.lastSeq\(\), action: /],
    ['matchActions.ts', /c\.send\(\{ type: 'bombAction', seq: c\.lastSeq\(\), action: 'drop' \}\)/],
    ['netPage.ts', /this\.client\.send\(\{ type: 'pickup', seq: this\.client\.lastSeq\(\), did \}\)/],
  ])('%s sends its ask with the client\'s lastSeq()', (file, sender) => {
    expect(read(file)).toMatch(sender);
  });

  it('NetClient.lastSeq() is a whole number from the start: 0, then each command\'s ++, or the room\'s own seq', () => {
    const client = read('net/client.ts');
    expect(client).toMatch(/private seq = 0;/);
    const writes = [...client.matchAll(/this\.seq\s*(=|\+\+)[^;]*;|\+\+this\.seq/g)].map((m) => m[0]);
    expect(writes).toEqual(['++this.seq', 'this.seq = Math.max(this.seq, ev.seq);']);
    expect(client).toMatch(/lastSeq\(\): number \{\s*return this\.seq;/);
  });
});
