import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { shouldReopenArmory } from '../src/mods/armoryReopen';

const open = { asked: true, dataLanded: true, loadFinished: true, solo: true };

describe('a mod reload opens the solo ARMORY after the load, not under it', () => {
  it('waits until the fresh data has landed and the loading screen is down', () => {
    expect(shouldReopenArmory(open)).toBe(true);
    expect(shouldReopenArmory({ ...open, asked: false })).toBe(false);
    expect(shouldReopenArmory({ ...open, dataLanded: false })).toBe(false);
    // The data arriving while the loading screen is up is the open that the load then closes.
    expect(shouldReopenArmory({ ...open, loadFinished: false })).toBe(false);
    expect(shouldReopenArmory({ ...open, solo: false })).toBe(false);
  });

  it('main.ts opens from that gate, after first paint, and does not seat the previous screen', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const main = readFileSync(resolve(here, '../src/main.ts'), 'utf8');
    const armoryAt = main.indexOf("message.kind === 'armory'");
    const armoryCase = main.slice(armoryAt, main.indexOf('if (message.id !== wantedMap)', armoryAt));
    const paint = main.slice(main.indexOf('ui.setLoading(false);'), main.indexOf('ui.setLoading(false);') + 180);
    expect(main).toContain('shouldReopenArmory');
    expect(armoryCase).toContain('tryReopenArmory()');
    expect(armoryCase).not.toMatch(/armoryPart\.open\(/);
    expect(paint).toContain('tryReopenArmory()');
    expect(main).toMatch(/if \(!reopenArmory\) armoryPart\.seat\(\)/);
  });
});
