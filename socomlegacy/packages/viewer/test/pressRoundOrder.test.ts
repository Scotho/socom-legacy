import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * LATER 347: the page's frame sets the trigger the walk's commands carry (`NetPage.trigger`) after the pad's read and
 * before `walk.frame` builds the frame's commands -- LATER 236's order for the view's lanes -- so a press's commands carry
 * its Trigger bit in the press's own frame and its round (`NetPage.fireEvent`'s hold) is named at one of them. Was: the
 * bit set in `net.frame` only, after the walk: the press frame's commands went without it. Both match pages' loops.
 */
describe('LATER 347: the trigger set between the pad\'s read and the walk\'s commands', () => {
  for (const file of ['main.ts', 'matchMount.ts']) {
    it(file, () => {
      const src = readFileSync(resolve(import.meta.dirname, '../src', file), 'utf8');
      // The pad's read is `padFrame(dt);` in /testroom's loop, `padFrame(dt, now);` in the match mount's (#481: the
      // in-match Settings' frame).
      const pad = src.search(/padFrame\(dt(, now)?\);/), walk = src.indexOf('walk.frame(dt);');
      const set = src.slice(pad, walk).indexOf('net?.trigger(');
      expect([pad > 0, walk > pad, set > 0]).toEqual([true, true, true]);
      // The turret's trigger rides the same set (the 347 review's finding 2): its bit moves with the firearm's, and a
      // turret's press round past 60 fps in a frame that sends no command is LATER 352's.
      const call = src.slice(pad + set, walk);
      expect(call.slice(0, call.indexOf(';')), `${file}: the turret's trigger in the early set`).toContain('acts.triggerHeld()');
    });
  }
});
