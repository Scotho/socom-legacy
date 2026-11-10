import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { planForgeLayout } from '../../src/forge/agent/commands';
import { emptyLayout } from '../../src/forge/layout';

/**
 * FC-1 (the owner, 2026-11-07: "re: crispy's work, take this on and finish it: hiding the pitch/roll/scale"; a browser
 * adaptation, FG.R2 -- the game has no editor): the Overhaul's pitch, roll and scale controls change nothing a layout
 * keeps -- record v3 keeps a piece's yaw alone (`creator-contracts` `recordOfLayout`) -- so they are hidden behind one
 * named switch until the record keeps them; the agent's surface refuses a piece's pitch as not supported yet.
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = (path: string): string => readFileSync(resolve(here, '../../src/forge', path), 'utf8').replace(/\r\n/g, '\n');

describe('FC-1: the pitch / roll / scale stubs hidden behind one switch', () => {
  it('the switch exists, is true, and the page reads it', () => {
    expect(source('transformStubs.ts')).toMatch(/^export const FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION = true;$/m);
    expect(source('page.ts')).toMatch(/import \{ FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION \} from '\.\/transformStubs';/);
  });

  it('the rotate gizmo\'s tilt rings are off while the switch is on (jsdom draws no gizmo; FG.R10 as before the Overhaul)', () => {
    const page = source('page.ts');
    expect(page).toContain("gizmo.showX = !FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION || gizmo.mode !== 'rotate';");
    expect(page).toContain("gizmo.showZ = !FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION || gizmo.mode !== 'rotate';");
  });

  it('the agent: a piece\'s pitch is refused as not supported yet, the layout untouched; a view\'s pitch still sets', () => {
    let l = planForgeLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'piece.place', { asset: 'MP2:crate', at: [0, 0, 0] }, []);
    expect(() => planForgeLayout(l, 'placement.set', { ref: 'piece:0', field: 'pitch', value: 30 }, [])).toThrow(/pitch is not supported yet/);
    l = planForgeLayout(l, 'view.place', { at: [0, 10, 0], yaw: 0, pitch: 0 }, []);
    l = planForgeLayout(l, 'placement.set', { ref: 'view:0', field: 'pitch', value: -30 }, []);
    expect(l.scenicViews![0]!.pitch).toBe(-30);
  });
});
