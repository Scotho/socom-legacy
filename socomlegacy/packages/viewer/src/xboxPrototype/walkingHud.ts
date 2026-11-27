import { defaultFireMode } from '../accuracy';
import { initialFirearmSlot, slotIcon, slotRecord } from '../loadout';
import { MagazineRing, ringFor } from '../magazines';
import type { PlaySnapshot } from '../mover';
import { overall } from '../net/damage';
import type { ServerEvent } from '../net/protocol';
import type { Loadout, WeaponRecord } from '@s2u/scene';
import type { FireState } from '../fireCore';
import type { WalkingMap } from './runtimeAssets';
import type { PrototypeHud } from './sceneFrame';

/** Experimental HUD feed. Shared HudState renders server health/time and the
 * mounted FireCore's current ammunition. walkingMatch owns round/dead-player
 * presentation; equipment feeds remain separate. Unknown live state stays hidden
 * rather than displaying the HUD fixture's default ammunition/timer.
 */
export function walkingHud(hud: PrototypeHud, map: WalkingMap, ownId: () => number, kitOf: () => Loadout) {
  let ready = false, clockKnown = false, endsAt: number | null = null, slot: 0 | 1 = 0;
  let roundSeconds: number | null = null;
  let rings: [MagazineRing, MagazineRing] | null = null;
  let combatMagazine: FireState['magazine'] | null = null;
  /** An equipment item up (`../matchThrow` `equipmentIcon`, `equipmentMagazine`): its icon and count stand in the weapon box. */
  let item: { icon: string; rounds: number; capacity: number } | null = null;
  const setKit = (entries?: [number[], number[]], held?: 0 | 1) => {
    combatMagazine = null;
    const kit = kitOf(), records = [slotRecord(map.arsenal?.table ?? null, kit, 0), slotRecord(map.arsenal?.table ?? null, kit, 1)] as const;
    rings = entries ? [MagazineRing.from(records[0], entries[0]), MagazineRing.from(records[1], entries[1])] : [ringFor(records[0]), ringFor(records[1])];
    slot = held ?? initialFirearmSlot(map.arsenal?.table ?? null, kit);
    hud.setWeaponIcon(slotIcon(map.arsenal?.table ?? null, kit, slot) ?? '');
    const mode = defaultFireMode(records[slot]);
    hud.setFireMode(mode === 3 ? 'auto' : mode === 2 ? 'burst' : 'single');
  };
  hud.setVisible(false);
  return {
    /** The mounted firearm owns current-index, reload and spend state. No second
     * magazine simulation runs in the HUD once that feed is connected. */
    combat(value: { weapon: 0 | 1; record: WeaponRecord; state: FireState; mode: number }) {
      slot = value.weapon; combatMagazine = value.state.magazine;
      hud.setWeaponIcon(item ? item.icon : slotIcon(map.arsenal?.table ?? null, kitOf(), slot) ?? '');
      hud.setFireMode(value.mode === 3 ? 'auto' : value.mode === 2 ? 'burst' : 'single');
    },
    /** The item in the hand for the weapon box, or null for the firearm; told before `combat` each frame. */
    equipment(value: { icon: string; rounds: number; capacity: number } | null) { item = value; },
    visible() { return ready && clockKnown; },
    event(event: ServerEvent, now: number) {
      if (event.type === 'welcome') { hud.setPlayerName(event.name); ready = false; clockKnown = false; endsAt = null; roundSeconds = null; }
      else if (event.type === 'spawn' && event.id === ownId()) { setKit(); hud.setHealth(1); ready = true; }
      else if (event.type === 'resume' && event.id === ownId()) {
        // Resume carries magazine slots without their current index. Until the
        // combat adapter owns that state, do not present guessed ammunition.
        ready = false; rings = null;
      } else if ((event.type === 'kill' && event.victim === ownId()) || (event.type === 'deadAtLoad' && event.id === ownId())) {
        ready = false; hud.setHealth(0);
      } else if (event.type === 'abandoned') { ready = false; clockKnown = false; endsAt = null; roundSeconds = null; }
      else if (event.type === 'hurt') hud.setHealth(overall({ hp: event.health, armour: [] }));
      else if (event.type === 'kit') setKit(event.rounds, slot);
      else if (event.type === 'score') {
        hud.setScoreRows(event.rows.map(row => ({ ...row, self: row.id === ownId() })), event.spectators, event.wins);
        if (event.timeLeft !== null) {
          clockKnown = true; hud.setTimer(event.timeLeft); endsAt = event.clockHeld ? null : now + event.timeLeft * 1000;
        }
      } else if (event.type === 'roundStart') {
        roundSeconds = event.seconds; clockKnown = true; hud.setTimer(event.seconds); endsAt = now + event.seconds * 1000;
      } else if (event.type === 'roundTime') {
        // Same total-length delta as NetPage (research 237 section 3), not a fresh countdown.
        if (roundSeconds === null) { clockKnown = false; endsAt = null; }
        else if (endsAt !== null) endsAt -= (roundSeconds - event.seconds) * 1000;
        roundSeconds = event.seconds;
      } else if (event.type === 'roundOver') endsAt = null;
    },
    frame(snapshot: PlaySnapshot, now: number, scoreboard: boolean) {
      hud.setVisible(ready && clockKnown);
      hud.setScoreboard(scoreboard);
      if (endsAt !== null) hud.setTimer(Math.max(0, (endsAt - now) / 1000));
      if (!rings && !combatMagazine && !item) return;
      const ring = rings?.[slot];
      const magazine = item ? { rounds: item.rounds, capacity: item.capacity, spare: 0, reloading: false }
        : combatMagazine ?? { rounds: ring!.rounds(), capacity: ring!.capacity, spare: ring!.shownMags(), reloading: false };
      hud.feed({ magazine,
        yaw: snapshot.yaw, stance: snapshot.stance, position: [snapshot.feet[0], snapshot.feet[2]] });
    },
    report() { const state = hud.state(); return { visible: state.visible, ready, clockKnown, name: state.model.name, health: state.model.health,
      rounds: state.model.rounds, capacity: state.model.capacity, timer: state.model.timer, yaw: state.model.yaw }; },
  };
}
