/**
 * The page's own-name rule (IQ-183, STREAMER-P1's own name, OT.R152; product track, **a browser adaptation** with no
 * original): how this player's own account name is drawn on the front end's own screens -- the game lobby's own seat in
 * its side's list and its own chat line, the briefing room's own row in the player list and its own chat lines (a
 * whisper to oneself included), and PLAYER INFO's name opened on the own account. The name sorted by, compared and sent is unchanged: only the drawing. A chat line is
 * kept as drawn, so the own lines already in a history keep the form they were drawn in when the rule changes (the
 * lists redraw at their next refresh). Unset, the name is drawn as the original draws it.
 * The viewer sets it (`viewer/src/streamerMode.ts`: "YOU" while Streamer mode's Room and account details are Hidden),
 * so `ui/` reads no viewer setting. The in-round own name is not drawn through it (the scope's s7, phase 2).
 */
let rule: ((name: string) => string) | null = null;

/** The page's rule (null: none, the name drawn as it is). */
export function setOwnNameDisplay(f: ((name: string) => string) | null): void { rule = f; }

/** This player's own account name as drawn now; a rule that throws draws the name. */
export function ownNameDrawn(name: string): string {
  if (!rule) return name;
  try { return rule(name); } catch { return name; }
}
