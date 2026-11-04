import type { StatusChipHandle, StatusChips } from './shell/statusBar';
import { createRulesCues, type RulesCueAudio, type RulesCueOptions, type RulesCueStats } from './rulesCues';

/**
 * FCW-32 round 2, held item 2 (FCW-31's carry-over; product track): what the room tells the page for its rules
 * (`rulesPresent`, `match/src/creator/rules/seam.ts` `RulesWire`) shown on the Forge's match surface -- the status chips
 * the page mirrors beside the match's Back (`./shell/statusBar` `matchElement`), not a new panel. A browser adaptation
 * with no original: it decides nothing (the room's rule host does) and shows only the pack's own presentation.
 *
 * A pack's text is shown as text, never as markup: each is a chip's word, set through `textContent` (`statusBar`'s
 * `draw`), so `<img src=x onerror=...>` reads as those characters and adds no element. `message`: the latest message, on
 * its chip. `hud`: each label's latest value, `label value`, joined on a second chip. `cue` (a sound by name): FUI-23
 * (FUI.R24) hears it on the match's own audio, through `./rulesCues` (handed the audio by `audio`, the gesture by
 * `gesture`, the match's frames by `frame`). A chip is registered at the first wire that needs it and removed at `clear`
 * (the match's end), so a match without rules adds none.
 */
export const FORGE_RULES_PRESENT_ADAPTATION =
  "the rules' message and hud shows as words on the Forge match's status chips, through textContent; a cue heard on the match's own sounds (rulesCues)" as const;

export const RULES_MESSAGE_CHIP = 'rules-message';
export const RULES_HUD_CHIP = 'rules-hud';
/** FCW-32 step 4 (FUI.R23 D5): the rules mode a Play runs, "PLAY · <mode name>", beside Back. */
export const RULES_MODE_CHIP = 'rules-mode';
/** Their places in the strip: after the page's own chips (`FORGE_CHIP_ORDER`, issues 50), the mode first. */
const ORDER = { mode: 55, message: 60, hud: 61 } as const;

export interface RulesPresenter {
  /** One wire from the room: a `rulesPresent` is shown; anything else is ignored. */
  take(ev: unknown): void;
  /** FCW-32 step 4 (FUI.R23 D5): a Play runs the rules mode `name`: "PLAY · <name>" beside Back (as text). */
  mode(name: string): void;
  /** FUI-23: the match's audio for the rules' cues (`./match` `forgeRulesCueAudio`); null once it is gone. */
  audio(a: RulesCueAudio | null): void;
  /** FUI-23 (FUI.R24 C3): a gesture -- the held cues' output asked to run, and played once it does. */
  gesture(): void;
  /** FUI-23: each match frame -- the held cues played once they can be; the pad's Cross a gesture at its press. */
  frame(pad?: { cross: boolean }): void;
  /** FUI-23: what the cue list played, holds and dropped (this match). */
  cueStats(): RulesCueStats;
  /** The match ended: the chips removed, the values forgotten, the held cues dropped. */
  clear(): void;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `cuesOptions`: the cue list's own (`./rulesCues` `RulesCueOptions`: the status line, the gesture's target, the clock). */
export function createRulesPresenter(chips: Pick<StatusChips, 'register'>, cuesOptions: RulesCueOptions = {}): RulesPresenter {
  const cues = createRulesCues(chips, cuesOptions);
  let message: string | null = null;
  const hud = new Map<string, string>();
  let messageChip: StatusChipHandle | null = null;
  let hudChip: StatusChipHandle | null = null;
  let modeName: string | null = null;
  let modeChip: StatusChipHandle | null = null;
  const hudWords = (): string | null => (hud.size ? [...hud].map(([label, value]) => `${label} ${value}`).join(' · ') : null);
  return {
    take(ev) {
      if (!isObj(ev) || ev['type'] !== 'rulesPresent' || !Array.isArray(ev['shows'])) return;
      let said = false, valued = false;
      const heard: string[] = [];
      for (const s of ev['shows'] as unknown[]) {
        if (!isObj(s)) continue;
        if (s['kind'] === 'message' && typeof s['text'] === 'string') { message = s['text']; said = true; }
        else if (s['kind'] === 'cue' && typeof s['cue'] === 'string') heard.push(s['cue']);
        else if (s['kind'] === 'hud' && typeof s['label'] === 'string' && ['number', 'boolean', 'string'].includes(typeof s['value'])) {
          hud.set(s['label'], String(s['value']));
          valued = true;
        }
      }
      if (said) {
        messageChip ??= chips.register({ id: RULES_MESSAGE_CHIP, order: ORDER.message, inMatch: true, tone: () => 'live', text: () => message, title: () => message ?? '' });
        messageChip.update();
      }
      if (valued) {
        hudChip ??= chips.register({ id: RULES_HUD_CHIP, order: ORDER.hud, inMatch: true, tone: () => 'ready', text: hudWords, title: () => hudWords() ?? '' });
        hudChip.update();
      }
      if (heard.length) cues.take(heard);                              // FUI-23: the wire's cues, one tick's
    },
    audio: (a) => { cues.attach(a); },
    gesture: () => { cues.gesture(); },
    frame: (pad) => { cues.frame(pad); },
    cueStats: () => cues.stats(),
    mode(name) {
      modeName = `PLAY · ${name}`;
      modeChip ??= chips.register({ id: RULES_MODE_CHIP, order: ORDER.mode, inMatch: true, tone: () => 'live', text: () => modeName, title: () => modeName ?? '' });
      modeChip.update();
    },
    clear() {
      messageChip?.remove();
      hudChip?.remove();
      modeChip?.remove();
      messageChip = hudChip = modeChip = null;
      message = modeName = null;
      hud.clear();
      cues.clear();
    },
  };
}
