import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * FG-47's review (2026-10-15), the page's two locks that multi-select must keep -- held on the page's source, as
 * `matchingClass.test.ts` holds the page's class, since `page.ts` mounts no unit:
 * - F1: the inspector's Yaw stays closed while a lobby locks the edits (`editsLocked`), a single selection too; a
 *   group's closed it whatever the lock.
 * - F2: Cross's tap-or-hold is off while the lobby's window takes the pad (`crossHoldsIn`'s `lobbyWindow`), so the
 *   release of a press the window took (LEAVE) acts not in the forge.
 */
const page = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/forge/page.ts'), 'utf8');

describe('FORGE multi-select: the lobby\'s locks kept (FG-47 F1, F2)', () => {
  it('F1: the yaw field closes for a group and for any selection while edits are locked', () => {
    expect(page).toMatch(/fyaw\.disabled = isGroup\(\) \|\| editsLocked\(\);/);
    expect(page).not.toMatch(/fyaw\.disabled = isGroup\(\);/);
    // The re-review's L2: every write that opens or closes an inspector field keeps the lock in it, wherever it is.
    const writes = [...page.matchAll(/\b(fx|fy|fz|fyaw)\.disabled\s*=([^;]*);/g)];
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w[2], w[0]).toContain('editsLocked()');
  });

  it('F2: the tap-or-hold is set from crossHoldsIn with the lobby\'s window named', () => {
    expect(page).toMatch(/forgePad\.crossHolds = crossHoldsIn\(\{[^}]*lobbyWindow: !!\(lobby\?\.popup && lobby\.shown\)[^}]*\}\);/);
  });
});
