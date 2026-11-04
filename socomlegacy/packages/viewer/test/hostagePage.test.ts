import { describe, expect, it } from 'vitest';
import { parseZdb } from '@s2u/archive';
import { aiCellOf, materialTable, type AiLoc } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { aiMapsFromBytes } from '../src/loadMap';
import { ACTION_CONTEXT_BITS, ACTION_CONTEXT_ORDER, contextPrompt, pickContext } from '../src/actionContext';
import { actionInputs, fireContext, fireTable, pageSources } from '../src/actionWiring';
import { ACTION_ICONS } from '../src/hud';
import { HUD_LIBRARIES } from '../src/hudAssets';
import {
  ESCORTEE_PROMPTS, ESCORTEE_PROMPT_READING, HostagePage, HOSTAGE_YES_AUDIENCE_PLACEHOLDER,
  type HostagePageDeps,
} from '../src/hostagePage';
import type { HostageStateWire } from '../src/net/protocol';
import { RESCUED_REORDER_READING } from '../src/net/hostageOrder';

/**
 * HX-4a (web sprint 31; research 239 s1, s3; ruling HX.R8): the `hostages` part's page module, headless -- the prompt
 * the page offers (the same test the room runs, `../src/net/hostageOrder`), its icon and text, the action lane's
 * context, and the fire. A fake net, cells and ray stand in; its mount is the wave-4 batch's (research 239 s7).
 */

type V3 = [number, number, number];
const cellOf = (feet: readonly number[]): AiLoc | null => ({ map: 0, x: Math.floor(feet[0]! / 10), z: Math.floor(feet[2]! / 10) });
const mat = (name: string) => materialTable().find((m) => m.name === name)!;

function rig(over: { bars?: string; unit?: number; opacity?: number; alive?: boolean; feet?: V3; spectator?: boolean; ai?: number } = {}) {
  const orders: [number, 4 | 5][] = [];
  const hostage: HostageStateWire = {
    id: 240, alive: over.alive ?? true, ai: over.ai ?? 0x17, leader: null, rescuer: null, opacity: over.opacity ?? 1, unit: over.unit ?? 17,
  };
  const feet: V3 = over.feet ?? [195, 0, 5];                                  // 19 cells along x from the hostage at (0, 0)
  const deps: HostagePageDeps = {
    self: () => ({ id: 1, alive: true, spectator: over.spectator ?? false, side: 'seal', feet }),
    hostages: () => [hostage],
    feet: (id) => (id === 240 ? [5, 0, 5] : null),
    aim: () => ({ eye: [feet[0], 60, feet[2]], far: [feet[0] - 300, 60, feet[2]] }),
    // The ray meets the hostage 190 u off; the bars, when there, at 60.
    bodies: () => [{ id: 240, distance: 190 }],
    surfaces: () => (over.bars ? [{ distance: 60, material: mat(over.bars) }] : []),
    cellOf,
    order: (id, cmd) => { orders.push([id, cmd]); return true; },
  };
  return { page: new HostagePage(deps), orders, hostage };
}

describe('HX-4a: the hostages part on the page (research 239 s1, s3)', () => {
  it("the page offers FOLLOW! on an unled living hostage under its crosshair within 20 cells and HOLD POSITION on one in its own unit, with action_escortee.tif (ESCORTEE_PROMPT_READING; FUN_0021ded0 D:L73564-73565); nothing past the fade, nothing through a blocking surface; escortee sits after the pickups and before the drop in the context order (bits 0x4000 and 0x8000, FUN_0021f850 D:L74050-74293; AD-6); the fire sends hostageOrder for the offered hostage and command", () => {
    expect(ESCORTEE_PROMPT_READING).toBe('FOLLOW! 0xe / HOLD POSITION 0xf, action_escortee.tif');
    expect(ESCORTEE_PROMPTS).toEqual({ 4: { text: 'FOLLOW!', action: 0xe, mask: 0x4000 }, 5: { text: 'HOLD POSITION', action: 0xf, mask: 0x8000 } });
    expect(HOSTAGE_YES_AUDIENCE_PLACEHOLDER).toBe('everyone, at the body');
    // FOLLOW! on the unled one; HOLD POSITION on one in the page's unit (seat 1's: 0x21).
    const a = rig();
    expect(a.page.offer()).toEqual({ hostage: 240, cmd: 4, text: 'FOLLOW!', prompt: 'escortee', icon: 'action_escortee.tif' });
    expect(rig({ unit: 0x21 }).page.offer()).toEqual({ hostage: 240, cmd: 5, text: 'HOLD POSITION', prompt: 'escortee', icon: 'action_escortee.tif' });
    // Another's follower: nothing; 20 cells: nothing; a dead one: nothing; a spectator: nothing.
    expect(rig({ unit: 0x22 }).page.offer()).toBeNull();
    expect(rig({ feet: [105, 0, 105] }).page.offer()).toBeNull();
    expect(rig({ alive: false }).page.offer()).toBeNull();
    expect(rig({ spectator: true }).page.offer()).toBeNull();
    // R4B-04 (r0004, OT.R97; RESCUED_REORDER_READING): a hostage whose state is 0x11 is offered nothing, inside the fade
    // too (the order test's twin r4 0x597630 asks the controller's state, vt+0xa4: the replicated AI word's on a page;
    // r0001 offered HOLD here online, HX.R5, superseded). One left in 0x17 at a partial opacity is still offered; past
    // the fade (opacity 0, the node inactive) nothing.
    expect(RESCUED_REORDER_READING).toBe('refused while its state is 0x11');
    expect(rig({ unit: 0x21, opacity: 0.4, ai: 0x11 }).page.offer()).toBeNull();
    expect(rig({ unit: 0x21, opacity: 0.4 }).page.offer()?.cmd).toBe(5);
    expect(rig({ unit: 0x21, opacity: 0 }).page.offer()).toBeNull();
    // Through the shut door's bars nothing; through the opened door's the order.
    expect(rig({ bars: 'METAL_GRATE' }).page.offer()).toBeNull();
    expect(rig({ bars: 'INVISIBLE_DI' }).page.offer()?.cmd).toBe(4);
    // The HUD's prompt and its bitmap in the HUD library (research 87 s5).
    expect(contextPrompt('escortee')).toBe('escortee');
    expect(ACTION_ICONS.escortee).toBe('action_escortee.tif');
    expect(HUD_LIBRARIES.HUD).toContain('action_escortee.tif');
    // The context: after the pickups and before the drop (AD-6: the picker's 0x4000/0x8000 come after the pickups'
    // 0x10/0x20 and 0x100/0x200, and before 0x40, FUN_0021f850 D:L74050-74293).
    expect(ACTION_CONTEXT_BITS.escortee).toEqual([0x4000, 0x8000]);
    expect(ACTION_CONTEXT_ORDER.indexOf('escortee')).toBeGreaterThan(ACTION_CONTEXT_ORDER.indexOf('c4'));
    expect(ACTION_CONTEXT_ORDER.indexOf('escortee')).toBe(ACTION_CONTEXT_ORDER.indexOf('pickup2') + 1);   // LkPaioX5 (c): after the second TAKE (0x20)
    expect(ACTION_CONTEXT_ORDER.indexOf('escortee')).toBe(ACTION_CONTEXT_ORDER.indexOf('bombDrop') - 1);
    expect(pickContext({ escortee: true, bombDrop: true })).toBe('escortee');
    expect(pickContext({ escortee: true, pickup: true })).toBe('pickup');
    expect(pickContext({ escortee: true, turret: true })).toBe('turret');
    expect(pickContext({ escortee: true, c4: true, door: true })).toBe('door');
    // The lane: the part's offer is the context's input; its fire is the part's.
    const sources = pageSources({
      walk: { mode: () => 'walk', isDead: () => false, isLocked: () => false }, doors: { target: () => null }, actions: { target: () => null },
      bomb: null, grenade: { c4Target: () => null }, turrets: { mounted: () => null, prompt: () => null },
      traversal: { hudClimb: () => null, traversal: () => null }, hostages: { offer: () => a.page.offer() },
    });
    expect(pickContext(actionInputs(sources))).toBe('escortee');
    const calls = fireTable({
      doors: { action: () => false }, actions: { action: () => false }, grenade: { plantC4: () => false }, turrets: { action: () => false },
      bombDrop: () => false, escortee: () => a.page.fire(),
    });
    expect(fireContext('escortee', calls)).toBe(true);
    expect(a.orders).toEqual([[240, 4]]);
    // Nothing offered: the fire sends nothing.
    const none = rig({ bars: 'METAL_GRATE' });
    expect(none.page.fire()).toBe(false);
    expect(none.orders).toEqual([]);
    // A state the room tells is taken at once: the hostage now led by seat 1, the prompt is HOLD POSITION.
    a.hostage.unit = 0x21;
    a.page.state({ type: 'hostageState', ...a.hostage });
    expect(a.page.offer()?.cmd).toBe(5);
  });

  const MP6 = fixture('RUN/MP6.ZDB');
  it.skipIf(!MP6)(`the page's LoadedMap.ai (aiMapsFromBytes) gives Desert Glory's base sub-map grid for the order's cells (ORDER_CELL_FIELD_READING): min (705.263, 1124.72), 10-unit cells, 167x128 -- the first hostage's start (1750.26, 1179.72) is cell (104, 5), as the room's aiCellOf gives it${MP6 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
    const grid = aiMapsFromBytes(MP6!, parseZdb(MP6!))!.maps[0]!;
    expect(grid.index).toBe(0);
    expect(grid.min[0]).toBeCloseTo(705.263, 3);
    expect(grid.min[2]).toBeCloseTo(1124.72, 2);
    expect([grid.cellSize, grid.cellsX, grid.cellsZ]).toEqual([[10, 10], 167, 128]);
    expect(aiCellOf(grid, 1750.26, 1179.72)).toEqual({ map: 0, x: 104, z: 5 });
    expect(aiCellOf(grid, 0, 0)).toBeNull();
    expect(aiMapsFromBytes(new Uint8Array(0), [])).toBeUndefined();
  });
});
