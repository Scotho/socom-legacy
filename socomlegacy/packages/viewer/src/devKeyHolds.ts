/**
 * LATER 190 (OT.R29: a development build's): whether a development editor over the page holds the physical keyboard --
 * /testroom's SETUP TAUNTS dev editor (`./tauntDevEditor`) while it is open -- so the page's key listeners that hear a key
 * before the editor's (the round text line's, `./roundTextLine`; the dev talk key, `./voice/headset`) leave it alone. A
 * registry with no imports; nothing registers in a release build (the editor is not in its bundle), so there nothing is
 * held and those listeners behave as before. A browser adaptation, a playtest instrument's.
 */
const holders = new Set<() => boolean>();

/** A holder, asked at each key, until the answer is called. */
export function holdDevKeys(open: () => boolean): () => void {
  holders.add(open);
  return () => { holders.delete(open); };
}

/** Whether a registered development editor holds the keys now. */
export function devKeysHeld(): boolean {
  for (const open of holders) if (open()) return true;
  return false;
}
