import { describe, expect, it } from 'vitest';
import { EquipmentSlots } from '../src/equipmentSlots';
import { launcherClaimSlots, pickupKitOf } from '../src/net/pickupRules';

describe('launcher pickup after independent equipment depletion (research 361 §3)', () => {
  it('offers the spent first duplicate while a second duplicate still has ammunition', () => {
    const ammo = new EquipmentSlots([
      { slot: 2, record: { name: 'M67', capacity: 3, mags: 1 } },
      { slot: 3, record: { name: 'M67', capacity: 3, mags: 1 } },
    ]);
    for (let n = 0; n < 3; n++) ammo.spend('M67', 2);
    const kit = pickupKitOf([54, 15, 121, 121, 255], null, () => 0, ammo.totals(), ammo.state());
    expect(kit.map(s => s.rounds)).toEqual([0, 0, 0, 3, 0]);
    expect(launcherClaimSlots(kit)).toEqual({ launcher: 2, round: 4 });
    const legacy = pickupKitOf([54, 15, 121, 121, 255], null, () => 0, ammo.totals());
    expect(launcherClaimSlots(legacy)).toBeNull();
  });
});
