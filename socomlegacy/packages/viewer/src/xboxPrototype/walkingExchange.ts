import type { Side } from '@s2u/scene';
import type { LoadedMap } from '../loadMap';
import { PlayerLoadout, wireLoadout, type LoadoutRequest } from '../loadout';
import { mountExchange } from '../matchExchange';
import type { NetClient } from '../net/client';
import type { ServerEvent } from '../net/protocol';

/**
 * XBOX-ARMORY (a contribution to imbennyhim's fork; product track): the lightweight match's in-match loadout change --
 * WEAPON EXCHANGE, R2 while dead (research 94 part 2), the room applying the side's list at the next spawn. In a match
 * nothing opens the ARMORY (the owner's INT.R3, 2026-10-02; `../armoryGlue`), so this is the standard match's part
 * (`../matchExchange` `mountExchange`, as `../matchMount` mounts it) over this runtime's client, in place of the
 * front end's `NetPage`:
 * - the gate is `NetPage.gate`'s: in the match, a player, dead or a ghost; the camera taken as the page's own (this
 *   runtime has no teammate follow camera);
 * - the request is `NetPage.requestLoadout`'s, the side's whole list, but with no `char`: the room keeps the type it
 *   holds (`Room.loadout`), the type being the ARMORY's (outside a round), never WEAPON EXCHANGE's;
 * - the kit it opens on is the room's (`kitHeld`, KIT-HELD: the lobby's picks kept), each answer settling its request
 *   in order (`PlayerLoadout.roomAnswer`, `matchNet`'s `loadoutAnswer`);
 * - the own spawn puts the room's kit on the body; the menu closes when the body stands (`spawned`, a held spawn's
 *   once it lands, as `../netPage` resets it).
 * Not here: the dead's prompt text (this runtime's HUD draws the help lines), the touch button, the key `I` and the left
 * stick's d-pad press in the menu (EXCHANGE-STICK, `exchange.stick`: this runtime's menus see no raw pad; the d-pad works).
 */
export function walkingExchange(d: {
  map: Pick<LoadedMap, 'arsenal'>; client(): NetClient | null; alive(): boolean; walking(): boolean;
  win?: { addEventListener(type: string, fn: EventListener): void; removeEventListener(type: string, fn: EventListener): void };
}) {
  const loadouts = new PlayerLoadout();
  loadouts.setMap(d.map.arsenal?.table ?? null, d.map.arsenal?.map ?? null);
  const inFlight: LoadoutRequest[] = [];
  const side = (): Side => d.client()?.team === 'terrorist' ? 'terrorist' : 'seal';
  const net = {
    gate() {
      const c = d.client(), player = c?.role === 'player';
      return { inMatch: c?.state === 'open', alive: player && d.alive(), cameraOnSelf: true, spectator: !player };
    },
    prompt: () => null,
    requestLoadout(picks: readonly { slot: number; id: number }[]): void {
      const c = d.client();
      if (!c || c.state !== 'open' || c.role !== 'player') return;
      const list = picks.map(p => ({ slot: p.slot, id: p.id }));
      inFlight.push({ list });
      c.send({ type: 'loadout', picks: list });
    },
  };
  const exchange = mountExchange({ net: () => d.client() ? net : null, map: () => d.map, side, loadouts, walking: d.walking, device: () => 'pad', ...(d.win ? { win: d.win } : {}) });
  return {
    exchange, loadouts, net,
    /** The room's events, heard before the runtime's own parts. */
    event(event: ServerEvent): void {
      const c = d.client();
      if (event.type === 'welcome') { inFlight.length = 0; loadouts.seated(event.role === 'player' ? event.team : null, event.char ?? null); }
      else if (event.type === 'demoted') { inFlight.length = 0; loadouts.unseated(); }   // review F3: the room drops them (`../netPage`'s)
      else if (event.type === 'kitHeld') {
        if (c?.role === 'player' && inFlight.length === 0 && (event.team === 'seal' || event.team === 'terrorist')) loadouts.held(event.team, event.char, event.picks, event.kit);
      } else if (event.type === 'loadout') {
        loadouts.roomAnswer(side(), event.kit, event.refused, inFlight.shift() ?? null, event.char ?? null);
        const kit = wireLoadout(event.kit);
        if (kit) exchange.answer(kit);
      } else if (event.type === 'spawn' && event.id === c?.id) {
        loadouts.spawn(side(), { kit: event.kit ?? null, type: event.char ?? null });
      }
    },
    /** The own body stands (a spawn, a held one once it lands): the menu closed (review F2; `../netPage` resets it then). */
    spawned(): void { exchange.reset(); },
    dispose(): void { exchange.dispose(); },
  };
}
export type WalkingExchange = ReturnType<typeof walkingExchange>;
