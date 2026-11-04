/**
 * KEYBOARD-WHISPER (OT.R48; web research 266 §3.9): which keys the online round's USB-keyboard text line takes now, so
 * a page listener that hears a key before the line does (a development build's voice talk key, `./voice/headset`, on
 * the window's capture phase ahead of the line) can leave the line's keys alone -- the original's line takes every key
 * `FUN_002c6c70` acts on while the round is online (D:L167254-167318). A registry with no imports, so the front end's
 * bundle reaches it without the HUD. The takers are `./roundTextLine`'s `attachRoundTextKeys`, each while attached.
 */
const takers = new Set<(e: KeyboardEvent) => boolean>();

/** A taker held until the answer is called. */
export function holdRoundLineKeys(takes: (e: KeyboardEvent) => boolean): () => void {
  takers.add(takes);
  return () => { takers.delete(takes); };
}

/** Whether an attached, online line takes this key. */
export function roundLineTakes(e: KeyboardEvent): boolean {
  for (const takes of takers) if (takes(e)) return true;
  return false;
}
