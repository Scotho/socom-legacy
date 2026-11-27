// XBOX-ARMORY (the Xbox lightweight fork, imbennyhim's; product track): "can't switch armory in game" / "no loadout change"
// (players' reports, 2026-11-18 / 11-22). In a match the in-match loadout change is WEAPON EXCHANGE -- R2 while dead --
// never the ARMORY (the owner's INT.R3, 2026-10-02; `../src/armoryGlue`). The fork now mounts the production part
// (`../src/matchExchange` `mountExchange`) over its own client (`../src/xboxPrototype/walkingExchange`), and its menus
// hand WEAPON EXCHANGE the pad as the standard match does (`../src/matchMount`: START, the Chat menu, then the exchange).
import { describe, expect, it, vi } from 'vitest';
import type { KitTable } from '@s2u/scene';
import { BAKED_LOADOUT } from '../src/loadout';
import type { ClientEvent, ServerEvent } from '../src/net/protocol';
import type { PadButton } from '../src/gamepad';
import { HudState } from '../src/hudState';
import { walkingExchange } from '../src/xboxPrototype/walkingExchange';
import { walkingMenus } from '../src/xboxPrototype/walkingMenus';
import type { MatchExchange } from '../src/matchExchange';

/** A concrete HudState (HudState is abstract), as `./xboxWalkingHud.test.ts`'s: the shared state, no drawing. */
class TestHud extends HudState {
  protected build() {} protected clear() {} protected hasDrawables() { return true; }
  sizes() { return { white: { width: 1, height: 1 } }; }
}

function client(team: 'seal' | 'terrorist' = 'seal') {
  const sent: ClientEvent[] = [];
  return { sent, c: { id: 3, state: 'open', role: 'player', team, send: (event: ClientEvent) => { sent.push(event); } } };
}

describe('the lightweight match: WEAPON EXCHANGE over the fork\'s client', () => {
  it('its gate is the standard one: in the match, a player, dead', () => {
    const { c } = client(); let alive = true;
    const x = walkingExchange({ map: {}, client: () => c as never, alive: () => alive, walking: () => true });
    expect(x.exchange.gate()).toEqual({ inMatch: true, alive: true, cameraOnSelf: true, spectator: false });
    alive = false;
    expect(x.exchange.gate()).toMatchObject({ inMatch: true, alive: false, spectator: false });
    x.dispose();
  });

  it('starts from the room\'s held kit (kitHeld), sends the side\'s whole list without a type, and takes the room\'s answer', () => {
    const { c, sent } = client();
    const x = walkingExchange({ map: {}, client: () => c as never, alive: () => false, walking: () => true });
    const answered = vi.spyOn(x.exchange, 'answer');
    const kit = [...BAKED_LOADOUT];
    x.event({ type: 'kitHeld', team: 'seal', char: 0, picks: [{ slot: 2, id: 121 }], kit } as ServerEvent);
    expect(x.loadouts.picks('seal')).toEqual([{ slot: 2, id: 121 }]);   // the lobby's picks kept (KIT-HELD)
    x.net.requestLoadout([{ slot: 2, id: 121 }, { slot: 3, id: 122 }]);
    // No `char`: the room keeps the type it holds (`Room.loadout`), so a mid-round change is never refused `round`.
    expect(sent).toEqual([{ type: 'loadout', picks: [{ slot: 2, id: 121 }, { slot: 3, id: 122 }] }]);
    x.event({ type: 'loadout', kit, refused: null, char: 0 } as ServerEvent);
    expect(answered).toHaveBeenCalledTimes(1);
    expect(x.loadouts.pending('seal')).toEqual(kit);
    x.dispose();
  });

  it('review F3: a demotion drops the requests in flight (the room drops them), so the next kitHeld is taken', () => {
    const { c } = client();
    const x = walkingExchange({ map: {}, client: () => c as never, alive: () => false, walking: () => true });
    x.net.requestLoadout([{ slot: 2, id: 121 }]);
    x.event({ type: 'demoted', position: 1 } as ServerEvent);
    x.event({ type: 'kitHeld', team: 'seal', char: 0, picks: [{ slot: 3, id: 122 }], kit: [...BAKED_LOADOUT] } as ServerEvent);
    expect(x.loadouts.picks('seal')).toEqual([{ slot: 3, id: 122 }]);
    x.dispose();
  });

  it('sends nothing for a spectator or a closed socket', () => {
    const { c, sent } = client();
    const x = walkingExchange({ map: {}, client: () => c as never, alive: () => false, walking: () => true });
    c.role = 'spectator'; x.net.requestLoadout([]);
    c.role = 'player'; c.state = 'closed'; x.net.requestLoadout([]);
    expect(sent).toEqual([]);
    x.dispose();
  });

  it('the own spawn puts the room\'s kit on the body and closes the menu', () => {
    const { c } = client();
    const x = walkingExchange({ map: {}, client: () => c as never, alive: () => true, walking: () => true });
    const reset = vi.spyOn(x.exchange, 'reset');
    const kit = [...BAKED_LOADOUT]; kit[2] = 122;
    x.event({ type: 'spawn', id: 3, at: [0, 0, 0], yaw: 0, after: 0, kit } as ServerEvent);
    expect([...x.loadouts.loadout()]).toEqual(kit);
    x.event({ type: 'spawn', id: 4, at: [0, 0, 0], yaw: 0, after: 0, kit } as ServerEvent);   // another seat's: not ours
    expect(reset).not.toHaveBeenCalled();
    // Review F2: the menu closes when the body stands (`spawned`, the runtime's own and held spawns alike), never at a
    // held spawn's arrival, as `../src/netPage` resets it only once the held spawn stands.
    x.spawned();
    expect(reset).toHaveBeenCalledTimes(1);
    x.dispose();
  });
});

describe('the lightweight match\'s menus: WEAPON EXCHANGE holds the pad as the standard match\'s', () => {
  const mount = (exchange: Pick<MatchExchange, 'edges' | 'pad' | 'isOpen' | 'overlay' | 'input'>) => {
    const hud = new TestHud();
    const menus = walkingMenus({ hud: hud as never, table: null as KitTable | null, loadout: () => BAKED_LOADOUT,
      walking: () => true, alive: () => false, inMatch: () => true, spectator: () => false,
      firearm: { kitChangeGate: () => true, select: () => true, hand: () => 0, records: () => [] as never, magazineOf: () => ({ rounds: 0, capacity: 0, spare: 0 }) },
      items: { takeable: () => null, hasDetonator: () => false, heldSlot: () => null, held: () => null, phase: () => 'idle', magazineOf: () => null, left: () => 0,
        selectEquipment: () => false, selectDetonator: () => false, putAway: () => {}, launcherRounds: () => 0, wadingDepth: () => 0, launcherSlot: () => null },
      caption: () => null, title: () => null, sound: () => {}, exchange: exchange as MatchExchange });
    return { hud, menus };
  };
  const idle = { moveX: 0.5, moveY: 0, lookX: 0, lookY: 0, fire: false, inventory: true } as never;

  it('R2 while dead: the exchange takes the press and holds the pad; the game\'s lanes take nothing; START stays shut', () => {
    let open = false;
    const seen: ReadonlySet<PadButton>[] = [];
    const exchange = {
      edges: (down: ReadonlySet<PadButton>) => down, isOpen: () => open,
      pad: (edges: ReadonlySet<PadButton>) => { seen.push(edges); if (edges.has('R2' as PadButton)) open = true; return open; },
      overlay: () => ({ quads: [{ element: 'weaponSelect' } as never], tris: [] }),
      input: { frame: (input: never, menu: boolean) => (menu ? { ...(input as object), moveX: 0, inventory: false } : input) as never },
    };
    const { hud, menus } = mount(exchange as never);
    const out = menus.pad(new Set(['R2' as PadButton]), idle, idle, 1 / 30, 1 / 30);
    expect(seen.at(-1)!.has('R2' as PadButton)).toBe(true);
    expect(out.owns).toBe(true);
    expect(out.input).toMatchObject({ moveX: 0, inventory: false });
    expect(menus.report().exchange).toBe(true);
    // Its quads are drawn with the others (`../src/matchMount`'s overlay order).
    const drawn = (hud as unknown as { overlay: ((f: unknown, s: unknown) => { quads: { element?: string }[] } | null) | null }).overlay;
    expect(drawn?.({ width: 640, height: 448 }, {})?.quads.some(q => q.element === 'weaponSelect')).toBe(true);
    // START refused while it is open (`../src/matchMount`'s `allowed`).
    menus.pad(new Set(['Start' as PadButton]), idle, idle, 1 / 30, 1 / 30);
    expect(menus.startMenu.isOpen()).toBe(false);
    menus.dispose();
  });

  it("review F1: the Chat menu's walk under it (OT.R130, `stickWalk`) keeps the sticks past the exchange's mask, as `../src/matchMount`", () => {
    const exchange = {
      edges: (down: ReadonlySet<PadButton>) => down, isOpen: () => false, pad: () => false, overlay: () => null,
      input: { frame: (input: never, menu: boolean) => (menu ? { ...(input as object), moveX: 0, moveY: 0, lookX: 0, lookY: 0 } : input) as never },
    };
    const { menus } = mount(exchange as never);
    const moving = { moveX: 0.5, moveY: -1, lookX: 0.25, lookY: 0, fire: false, inventory: false } as never;
    const out = menus.pad(new Set(), moving, moving, 1 / 30, 1 / 30, (_held, input) => ({ owns: true, walk: true, input }));
    expect(out.owns).toBe(true);
    expect(out.input).toMatchObject({ moveX: 0.5, moveY: -1, lookX: 0.25 });
    const still = menus.pad(new Set(), moving, moving, 1 / 30, 1 / 30, (_held, input) => ({ owns: true, input }));   // no walk: masked
    expect(still.input).toMatchObject({ moveX: 0, moveY: 0, lookX: 0 });
    menus.dispose();
  });
});

