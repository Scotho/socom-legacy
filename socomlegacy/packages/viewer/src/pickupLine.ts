import { ammoDisplayNameOf, type KitTable, type WeaponRecord } from '@s2u/scene';
import { throwableOf } from './equipment';

/**
 * PICKUP-LINE (R142 head B's line; research 234 §7, research 87 §14): what a bundle walked over posts on the taker's
 * HUD. `FUN_005bb000` -- the take of one bundle entry: a firearm entry's branch (D:L473174-473188) or an equipment
 * entry's (D:L473191-473353) -- returns at once when nothing was taken (D:L473356-473358); else it plays a sound through
 * the kit's `+0x888` (D:L473359-473362) and, when the character's `+0xc0` answers its virtual `+0x2c`
 * (D:L473363-473367), posts the entry's ammo record's string at `+4` (`FUN_003d4550` D:L326665-326669) on the small
 * message window `0x437060` in colour 0 (`FUN_002b6530` D:L473372-473374; `./hudLayout` `SMALL_MESSAGES`) unless it is
 * the window's newest line (D:L473369-473371). The page posts it from the room's `kit` after a walk-over
 * (`./matchFirearm` `takeKit`): only the taker's page is told its `kit`, the `+0xc0` gate's "local player" as the port
 * reads it. What stays open: the take's sound (`+0x888`, played before the gate, for every character's take) is not
 * played, and the `+0xc0` gate's virtual `+0x2c` is not read. Settles: the sound object's set-up at `+0x888` and its
 * vtable `+0x14`; the `+0xc0` object's vtable `+0x2c`; the rig's audio of a take. [placeholder]
 */
export const PICKUP_TEXT_PLACEHOLDER = 'no take sound; the +0xc0 gate read as the room telling only the taker its kit' as const;

/**
 * PICKUP-LINE: WHICH string a take posts -- the ammo record's `+4`, which the ammo loader `FUN_003cedb0` fills from the
 * `ZAMMO` record's `DisplayName` (the key at 0x3fc648, D:L322655-322659, through the setter `FUN_003d4650`
 * D:L326753-326765; its `InternalName`, key 0x3fc638, goes to `+0` by `FUN_003d46b0`, D:L322650-322654), and the post
 * reads back through `FUN_003d4550` (D:L326665-326669). Scene `Arsenal.ammoDisplayNames` holds them (`ammoDisplayNameOf`), the
 * disc's bytes: 7 of the 39 `ZAMMO` records differ from their `InternalName` (scene `test/arsenal.test.ts`), the rig's
 * "M67 Ammo" and "HE Grenade Ammo" the same in both. [reading, pending review]
 */
export const PICKUP_TEXT_READING = "the ZAMMO record's DisplayName (ammo +4, FUN_003cedb0), the disc's bytes" as const;

/**
 * PICKUP-LINE: a FIREARM entry's take posts too (correction 6). The post (D:L473359-473375) is `FUN_005bb000`'s common
 * tail: the firearm branch (D:L473174-473188) and the equipment branch (D:L473191-473353) both fall through to it, the
 * function's only earlier return being the "nothing taken" one (D:L473356-473358). `'posted'`: the firearm slot's
 * record's ammo, shown by its `ZAMMO` record's `DisplayName` (`PICKUP_TEXT_READING`; "5.56 x 45mm" the same in both),
 * as an equipment take posts its item's; `'none'` would post nothing for it. Settles it as proven: the rig's HUD frames
 * of a firearm-ammo take. [reading, pending review]
 */
export const PICKUP_TEXT_FIREARM_READING: 'posted' | 'none' = 'posted';

/**
 * PICKUP-LINE item 4, NOT BUILT (a named departure): the original posts one line per bundle ENTRY, in the bundle's entry
 * order, from the entry's own ammo record -- `FUN_005bb990` walks the pickup's entries by index (`FUN_003cfd70`, each
 * entry's weapon record, ammo record and count) and hands each to `FUN_005bb000` (D:L473549-473607), whose post reads
 * that ammo record's `+4` (D:L473373). The port posts each poured firearm ring first, then each written equipment
 * slot, from the TAKER's slot records (`pickupLines`): the room's `kit` message carries the loadout, the rings' added
 * amounts and the written equipment slots but no entry order nor the entries' ammo (match `src/worldDrops.ts`
 * `tellKit`; viewer `src/net/protocol.ts`, the `kit` message). Settles it: a `kit` field listing the taken entries' ammo
 * in the bundle's order (a wire change, the room's and the page's), then one line per entry from it. [placeholder]
 */
export const PICKUP_LINE_ENTRY_ORDER_PLACEHOLDER = "firearm rings first, then equipment slots, from the taker's records (the kit wire has no entry order)" as const;

/**
 * A take's line for an equipment item (`PICKUP_TEXT_READING`): its round's `ZAMMO` `InternalName` -- the kit table's item
 * (`Arsenal`'s `ammo`), else the baked throwable's -- shown by that record's `DisplayName` through the kit table's
 * `ammoDisplayNames` (no table: the `InternalName`, the baked records holding no `DisplayName`).
 */
export function ammoNameOf(table: KitTable | null, item: number): string | null {
  const ammo = table?.arsenal.items.get(item)?.ammo ?? throwableOf(table, item)?.ammo ?? null;
  return ammo === null ? null : ammoDisplayNameOf(table?.arsenal, ammo);
}

/** What the room's `kit` told of a take (`./takeKit`'s arguments, after the take). */
export interface PickupTake {
  /** The firearm slot a weapon claim replaced; null for a walk-over (or a launcher claim). */
  slot: 0 | 1 | null;
  /** The live kit after the take. */
  loadout: readonly number[];
  /** The kit's two firearm records after the take. */
  records: readonly [Pick<WeaponRecord, 'ammo'>, Pick<WeaponRecord, 'ammo'>];
  /** Each firearm ring's amounts the walk-over poured (`kit.added`). */
  added?: readonly [readonly number[], readonly number[]];
  /** The equipment slots the walk-over wrote (`kit.equipment`, LATER 1129). */
  equipment?: readonly { slot: number }[];
}

/**
 * The lines a take posts: each firearm slot a walk-over poured into (`PICKUP_TEXT_FIREARM_READING`), its record's
 * ammo shown by `display` (`PICKUP_TEXT_READING`: the `ZAMMO` record's `DisplayName`), then each equipment slot it wrote,
 * by its item's line (`ammoOf`, `ammoNameOf`: the same `DisplayName`) -- the kit's slot order (research 234 §2.3), not
 * the original's one line per bundle entry in the bundle's order (`PICKUP_LINE_ENTRY_ORDER_PLACEHOLDER`). A weapon
 * claim (`slot`) is `FUN_0059f0c0`'s, not the take's: none. The window's own rules drop a repeat
 * (`Hud.postSmallMessage`).
 */
export function pickupLines(
  take: PickupTake, ammoOf: (item: number) => string | null, display: (ammo: string) => string = (ammo) => ammo,
): string[] {
  if (take.slot !== null) return [];
  const out: string[] = [];
  if (PICKUP_TEXT_FIREARM_READING === 'posted') {
    for (const s of [0, 1] as const) {
      const ammo = take.records[s].ammo;
      if (ammo && (take.added?.[s] ?? []).some((n) => n > 0)) out.push(display(ammo));
    }
  }
  for (const e of take.equipment ?? []) {
    const item = take.loadout[e.slot];
    const name = item === undefined ? null : ammoOf(item);
    if (name) out.push(name);
  }
  return out;
}
