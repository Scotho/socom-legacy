import type { RoundQueueLine } from '@s2u/ui';
/**
 * The queue's line type, `@s2u/ui`'s own, re-exported for the round's modules: the front end's match (`./matchMount`)
 * takes it from here, so that file names no `@s2u/ui` import at all (PAR-17's pin, `test/parityExemptions.test.ts`), and
 * one definition stays the only one.
 */
export type { RoundQueueLine };
import { MESSAGE_SCALE, type BannerLine, type Hud } from './hud';
import { messageLine } from './matchMessages';

/**
 * SVC-19 (web research 266 §3): the round's text lines on the HUD's message window. Pure but for the HUD it posts on.
 *
 * In a round the lobby server's queue (0x437690, filled by `FUN_002f4ef0` D:L194781-194803 through `FUN_002a4050`
 * D:L147615-147669) is drained by the round's frame, `FUN_001f7ff0` (D:L56708-56719), not the front end's: each line is
 * posted by `FUN_002b6530(0, 0x4366a0, text, kind, 0, 0)` -- the main window (research 87 §14), the window's scale
 * (0), the kind as its colour (`./matchMessages` `MESSAGE_COLOURS`: 5 a whisper, 1 a universe line), not centred, no
 * fade of its own -- unless it is a whisper (kind 5) while the global `DAT_003de620` (EXTERNAL WHISPERS; set by
 * `FUN_002a41f0` D:L147670-147692 from `StoreOptions` and from the in-game menu's IN-GAME TEXT MESSAGES, `FUN_002041e0`
 * D:L61858-61867) is 0 and no actor of the round bears the sender's name (`FUN_0029e590` D:L144706-144720 over the actor
 * list 0x4362e0, each actor's `+0x28` record's `+0x90` name, compared case-blind by `FUN_00198b80` D:L15551). The loop
 * dequeues every line either way: a dropped whisper is gone, not held for later.
 *
 * A room's line is queued in the lobby's state 11 only (D:L194797), so a round sees whispers and universe lines alone.
 * The game session's line (`FUN_002ba9d0`) is not among them: it joins the game lobby's panel and posts nothing here
 * (`./netPage`'s `gameChat`).
 */

/** The queue's kinds a round sees (`FUN_002f4ef0` D:L194789-194795): a universe line 1, a whisper 5. */
export const ROUND_LINE_KIND = { universe: 1, whisper: 5 } as const;

/**
 * EXTERNAL WHISPERS before any `StoreOptions`: `DAT_003de620`'s initial byte, 1 (the ELF's data at 0x3de620, read
 * through `tools/elfImage.ts`); `global_valves.rdr`'s `EnableExternalWhispers` defaults to 1 too (research 265 §1.1).
 */
export const EXTERNAL_WHISPERS_INITIAL = 1;

/**
 * ROUND_ACTOR_NAMES_READING: who counts as "an actor of the round" for a whisper with EXTERNAL WHISPERS off.
 * `FUN_0029e590` walks the actor list 0x4362e0 (D:L144712-144717) -- its adds (`FUN_001eaaf0`, `FUN_001feae0` among
 * D:L145281-145377) and so its members are not traced; the page takes the round's players as the room's score names
 * them (`NetPage.rows`), the page's own seat and the dead among them, a spectator not (a spectator has no body). Settled
 * by the list's adds read, or ONL-32's two-instance round: a whisper from a spectator of the game with the option off.
 * [reading]
 */
export const ROUND_ACTOR_NAMES_READING = 'the round\'s players by the score\'s rows, the page\'s own and the dead among them' as const;

/*
 * The round's typed line -- a whisper on a USB keyboard (`FUN_002c6c70`, `FUN_002c9b80` -> `FUN_002c9990` ->
 * `FUN_002c9810`; research 266 §3.1) -- is built by KEYBOARD-WHISPER under OT.R48 in `./roundTextLine` (research 266
 * §3.9): its echo and its refusal post on the main window as the drain's lines do here.
 */

/** The option's global as `StoreOptions` leaves it (`OptionGlobals.value('EnableExternalWhispers')`), else its initial 1. */
export function externalWhispers(global: number | undefined): boolean {
  return (global ?? EXTERNAL_WHISPERS_INITIAL) !== 0;
}

/**
 * One queued line as the round's frame posts it (`FUN_001f7ff0` D:L56710-56716), or null when it drops it: a whisper
 * with EXTERNAL WHISPERS off from a sender no actor of the round is named.
 */
export function roundQueueLine(line: RoundQueueLine, o: { external: boolean; inRound(name: string): boolean }): BannerLine | null {
  // KEYBOARD-WHISPER: the round state's own line (`own`, `FUN_002f4ba0` -> `FUN_001ecc40`) is posted, not queued: no test.
  if (!line.own && line.kind === ROUND_LINE_KIND.whisper && !o.external && !o.inRound(line.name)) return null;
  return messageLine(line.text, line.kind, MESSAGE_SCALE);
}

export interface RoundChatDeps {
  hud: Pick<Hud, 'postMessage'>;
  /** EXTERNAL WHISPERS now (`externalWhispers` of the session's option globals). */
  external(): boolean;
  /** The round's actors' names (`ROUND_ACTOR_NAMES_READING`). */
  names(): readonly string[];
}

/** The round's drain on a match's HUD: `line` is what the front end's lobby chat hands a round (`BriefingRoomChat`'s `round`). */
export function mountRoundChat(d: RoundChatDeps): { line(l: RoundQueueLine): void } {
  const inRound = (name: string): boolean => {
    const n = name.toLowerCase();
    return d.names().some((m) => m.toLowerCase() === n);
  };
  return {
    line: (l) => {
      const drawn = roundQueueLine(l, { external: d.external(), inRound });
      if (drawn) d.hud.postMessage([drawn]);
    },
  };
}
