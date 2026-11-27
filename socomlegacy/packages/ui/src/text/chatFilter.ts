/**
 * A page's chat filter (STREAMER-P1, OT.R152; product track, **a browser adaptation** with no original): the page decides
 * whether another player's incoming chat line is drawn, by where it is heard (`lobby`: the briefing rooms and the game
 * lobby; `match`: a round) and who sent it (an account id where the line carries one, else a name). A line refused is
 * not drawn; the screens count them on one line (`chatHiddenWords`), rewritten in place. The player's own lines are
 * never asked. Unset, every line is drawn as the original draws it. The viewer sets it (`viewer/src/streamerMode.ts`:
 * Streamer mode's Chat from others), so `ui/` reads no viewer setting. Nothing sent is changed.
 */
export type ChatPlace = 'lobby' | 'match';
export interface ChatSender { readonly accountId?: number | null; readonly name?: string | null }

let shows: ((place: ChatPlace, sender: ChatSender) => boolean) | null = null;

/** The page's filter (null: none, every line drawn). */
export function setChatFilter(f: ((place: ChatPlace, sender: ChatSender) => boolean) | null): void { shows = f; }

/** Whether another player's line from `sender` is drawn at `place`; a filter that throws draws it. */
export function chatShows(place: ChatPlace, sender: ChatSender): boolean {
  if (!shows) return true;
  try { return shows(place, sender); } catch { return true; }
}

/** The one count line's words. */
export const chatHiddenWords = (n: number): string => `${n} message${n === 1 ? '' : 's'} hidden (streamer mode)`;
/** Whether `text` is a count line's words (the count rewritten in place). */
export const isChatHiddenWords = (text: string): boolean => /^\d+ messages? hidden \(streamer mode\)$/.test(text);
/** The count a count line's words carry (0: not one). */
export const chatHiddenCount = (text: string): number => (isChatHiddenWords(text) ? Number.parseInt(text, 10) : 0);
