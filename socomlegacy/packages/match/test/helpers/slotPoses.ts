import { wrapYaw } from '../../../viewer/src/yaw';
import type { Room } from '../../src/room';

/**
 * Test fixture (BOTS-LAND, H315): the bot tests run in respawn rooms -- the only games with bots -- whose round start
 * on a map of fewer than 24 records draws one record for every seat (`Room.pick`, RESPAWN_BLOCK_PLACEHOLDER's fallback),
 * so a side stands on one spot. Their controlled scenes were laid out on the start slots a classic round gives (the
 * client index's slot, `index % count`); this seats every living player there, facing its slot's step, after the launch.
 */
export function seatAtSlots(room: Room): void {
  const clientIndex = (room as unknown as { clientIndex: Map<number, number> }).clientIndex;
  for (const m of room.lobby.players()) {
    const p = room.player(m.id);
    if (!p?.alive || !m.team) continue;
    const side = m.team === 'seal' ? 0 : 1;
    const list = room.map.slots.filter((s) => s.side === side).sort((a, b) => a.index - b.index);
    const slot = list[(clientIndex.get(m.id) ?? 0) % list.length];
    if (!slot) continue;
    p.sim.walker.place(slot.position[0], slot.position[1], slot.position[2]);
    p.sim.walker.state.yaw = wrapYaw(-slot.step * 45);
  }
}
