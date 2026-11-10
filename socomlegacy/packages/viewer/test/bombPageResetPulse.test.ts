import { describe, expect, it, vi } from 'vitest';
import { BombPage, worldPulse, type BombPulseView } from '../src/bombPage';
import type { WorldState } from '../src/worldState';
import type { BombWire } from '../src/net/objective';
import type { ServerEvent, Team } from '../src/net/protocol';

/**
 * FP-1b (REVIEW-B 12; a browser adaptation's bound, FG.R2): the round's reset (bomb state 0) puts out the Forge's own
 * site outlines and nothing else -- the disc's `pulse_*` programs are the world's reset's to stop (`WorldState.reset`), as
 * they were before the Overhaul, so a disc map's bases are untouched by the page's pulse at a reset. A drop (state 1)
 * stops both, as `bomb_drop` does (research 284 s3).
 */
function pageWith(view: BombPulseView): (b: Partial<BombWire>) => void {
  const listeners = new Set<(ev: ServerEvent) => void>();
  const team = (id: number): Team => (id === 3 ? 'terrorist' : 'seal');
  new BombPage({ on: (l) => { listeners.add(l); return () => listeners.delete(l); } }, {
    id: () => 2, team: () => 'seal', alive: () => true, feet: () => [0, 0, 0], actions: () => [],
    look: () => null, serverTick: () => 1000, teamOf: team,
  }, { pulse: view });
  const base: BombWire = { state: 1, pos: [0, 0, 0], carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 0 };
  return (b) => { for (const l of listeners) l({ type: 'bomb', ...base, ...b } as ServerEvent); };
}

describe("the round's reset puts out the Forge's outlines only (bombPage)", () => {
  it('state 0 calls the view\'s reset, never its drop; state 1 its drop', () => {
    const view = { pickup: vi.fn(), drop: vi.fn(), reset: vi.fn() };
    const bomb = pageWith(view);
    bomb({ state: 2, carrier: 3 });
    expect(view.pickup).toHaveBeenCalledWith('terrorist');
    view.drop.mockClear();                                       // the page's first bomb state (no welcome) puts both out once
    bomb({ state: 0 });
    expect(view.reset).toHaveBeenCalledTimes(1);
    expect(view.drop).not.toHaveBeenCalled();
    bomb({ state: 1 });
    expect(view.drop).toHaveBeenCalledTimes(1);
  });

  it("worldPulse's reset stops no disc program, and puts the forge outlines out", () => {
    const stopped: string[] = [], shown: string[] = [];
    const world = {
      program: (name: string) => (name === 'objectives' ? { program: { sequences: [] } } : null), runDisplay: () => undefined,
      stopProgram: (name: string) => stopped.push(name),
      displayNode: (path: string, on: boolean) => shown.push(`${path} ${on ? 'on' : 'off'}`),
      displayOpacity: () => undefined,
    } as unknown as WorldState;
    const pulse = worldPulse(() => world, () => [{ path: 'forge/outline_0/seal_pulse', side: 'terrorist' }]);
    pulse.pickup('terrorist');
    shown.length = 0;
    pulse.reset!();
    expect(stopped).toEqual([]);
    expect(shown).toEqual(['forge/outline_0/seal_pulse off']);
  });
});
