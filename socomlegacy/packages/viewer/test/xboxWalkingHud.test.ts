import { expect, it } from 'vitest';
import { HudState } from '../src/hudState';
import { BAKED_LOADOUT } from '../src/loadout';
import { walkingHud } from '../src/xboxPrototype/walkingHud';
import type { WalkingMap } from '../src/xboxPrototype/runtimeAssets';
import type { PlaySnapshot } from '../src/mover';
import type { ServerEvent } from '../src/net/protocol';
import { slotRecord } from '../src/loadout';
import type { FireState } from '../src/fireCore';

class TestHud extends HudState {
  protected build() {} protected clear() {} protected hasDrawables() { return true; }
  sizes() { return { white: { width: 1, height: 1 } }; }
}
const snapshot = { yaw: 0, stance: 'stand', feet: [0, 0, 0] } as PlaySnapshot;
function setup() {
  const hud = new TestHud(), panel = walkingHud(hud, { arsenal: null } as unknown as WalkingMap, () => 7, () => BAKED_LOADOUT);
  panel.event({ type: 'welcome', name: 'PLAYER' } as ServerEvent, 0);
  panel.event({ type: 'spawn', id: 7 } as ServerEvent, 0);
  panel.event({ type: 'roundStart', seconds: 360 } as ServerEvent, 0);
  const frame = (now: number) => { panel.frame(snapshot, now, false); hud.layoutFrame({ width: 640, height: 448 }, 0); return panel.report(); };
  return { panel, frame };
}

it('subtracts a hostage penalty from the existing deadline, preserving elapsed time', () => {
  const { panel, frame } = setup();
  expect(frame(120000).timer).toBe(240);
  panel.event({ type: 'roundTime', seconds: 300 }, 120000);
  expect(frame(120000).timer).toBe(180);
});

it('does not show ammunition for a resumed combat seat whose current magazine is unknown', () => {
  const { panel, frame } = setup();
  panel.event({ type: 'resume', id: 7, weapon: 1, rounds: [[2, 30], [1, 12]], health: [100, 100, 100, 100, 100, 100], armour: [] } as unknown as ServerEvent, 1000);
  expect(frame(1000).visible).toBe(false);
});

it('feeds actual firearm state through shots, reloads, and switching instead of the spawn magazine', () => {
  const { panel, frame } = setup();
  const record = slotRecord(null, BAKED_LOADOUT, 1);
  const state = { magazine: { rounds: 4, capacity: 12, spare: 2, reloading: true } } as FireState;
  panel.combat({ weapon: 1, record, state, mode: 1 });
  expect(frame(1000)).toMatchObject({ rounds: 4, capacity: 12 });
  state.magazine.rounds = 12;
  state.magazine.reloading = false;
  panel.combat({ weapon: 1, record, state, mode: 1 });
  expect(frame(2000).rounds).toBe(12);
});

it.each([
  { type: 'kill', victim: 7 } as ServerEvent,
  { type: 'deadAtLoad', id: 7 } as ServerEvent,
  { type: 'abandoned' } as ServerEvent,
])('hides the incomplete walking presentation after $type until a new spawn', event => {
  const { panel, frame } = setup();
  expect(frame(0).visible).toBe(true);
  panel.event(event, 1000);
  expect(frame(1000).visible).toBe(false);
  panel.event({ type: 'spawn', id: 7 } as ServerEvent, 2000);
  panel.event({ type: 'roundStart', seconds: 360 } as ServerEvent, 2000);
  expect(frame(2000).visible).toBe(true);
  expect(frame(2000).health).toBe(1);
});
