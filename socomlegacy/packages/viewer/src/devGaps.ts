/**
 * What the test room's developer panel does not do, and why (`./devPanel`). A browser adaptation. These are the
 * page's limits, not stand-ins: nothing here changes a timer, a health number, or draws a path. Each note belongs
 * to a development instrument with no original (the ammo, the kit, the round, the bots), and while the panel is closed, the game's clock and ammo are main's; only the drawing overlays may stay.
 */
export const DEV_GAPS = {
  god: 'God mode is not available. The room owns health, and the HUD number is only a display.',
  health: 'Set health is not available. The room owns health, and the HUD number is only a display.',
  ammo: 'Refills this page\'s magazines when a shot empties one. A match\'s room keeps its own count.',
  kit: 'Up to five item ids, 0-255. Applied at the next spawn through the page\'s kit, not a second armoury.',
  hostages: 'Spawn or reset hostages is not available. The room owns the hostages, and the page has no command to reset them.',
  round: 'Force a round win or loss is not available. The room ends the round in private. Changing the HUD timer would only change the display.',
  timer: 'Skip or freeze the round timer is not available. The room owns the round clock.',
  bots: 'Add or remove teammates and enemies is not available. The page has no AI actor to spawn.',
  botView: 'Freeze them, and show their paths and look direction, is not available. There is no pathing and no look-direction debug, so nothing is drawn.',
} as const;
