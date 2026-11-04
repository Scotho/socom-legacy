# Original taunts: review summary

SOCOM II's in-match taunts -- the recorded character vocals and the five custom text taunts -- and the original
SETUP TAUNTS editor, as they stand on main. Chris's branch `chris/original-taunts` (b75f644b, runtime commit
1a974ea0) was merged onto main 6f5081a3 and reworked to the merge controller's handoff on `agent/taunts`
(2026-10-07). Game artwork, fonts and recordings are read from the player's own disc; the change adds no game assets.

## What is on main

- **The Chat menu's TAUNTS, in both matches.** Tap Circle to open it (TeamCommand, `FUN_002344e0`); TAUNTS lists
  CHARACTER TAUNT and CUSTOM TAUNT 01-05; held directions repeat; Triangle backs out and closes; holding Circle past
  0.3 s is the headset's and opens nothing (voice is not implemented). The other root rows are visible and do nothing.
  It is one shared part, `packages/viewer/src/matchTaunts.ts`, which the menu-launched ONLINE match (`matchMount.ts`,
  the original's place) and `/testroom` (`main.ts`) both mount: `FRONT_END_CAPABILITIES.taunts`, the `taunt` hook
  under `PART_DEPS.taunts`, the vocals through the match's sound part.
- **Delivery.** The server routes each taunt: the sender's echo once and the enemy team, dead enemies included;
  teammates and spectators get none, and dead players and spectators cannot send. The server names the sender, its
  team, character and position; it refuses unknown fields, forged recipients, oversized text and repeated requests,
  and holds the original's five-second delay per entry. The protocol's fields are additive (protocol 10 unchanged).
- **The five texts are saved on the emulated memory card**, as the original saves them: the persistent UI
  variables `MPTAUNTMSG1-5` in the save file `BASCUS-97275SOCOMII`'s `CUIVarManager` module, beside `CAcctDB`
  (research 102 R102.9). They are restored before `dlgNetLogin`'s defaults run, shared by every persona on the card,
  and carried by a LOAD or another card slot. No browser key holds them.
- **SETUP TAUNTS from the menus:** ONLINE > (log in) > OPTIONS > SETUP TAUNTS opens the disc's dialog and soft
  keyboard (45 characters, a fresh buffer each time); RETURN to ONLINE OPTIONS, then its RETURN or SAVE, saves the
  card through the original's `save_and_leave`. Physical typing reaches only the soft keyboard's text entry, in a
  release build too; no keyboard key reaches the game (the release is controller only).
- **Input ownership** (a browser safeguard): opening the menu lets the trigger go and cancels an uncommitted held
  grenade; a button held through the menu stays the menu's until let go.
- `/testroom`'s **Setup Taunts** button is a development build's only (`?devmode`), a playtest instrument.

## Evidence

Unit tests (the part, the menu, the card module and its size, the server's routing), dev-disc tests (the editor
over the disc's dialog, every map's vocal mapping, the card fixtures' ten keys) and the document checks are recorded
with their counts in [the plan's Log](plans/2026-10-06-original-taunts.md#log). The browser specs (`taunts.spec.ts`
from the menus, and the regressions beside it) are run by the merge controller in its gate tree. No physical
controller or speaker test and no comparison with the original running has been made: nothing here is **proven**.

## Open

The placeholders and gaps are [research 301](research/301-original-taunts.md) §8 and §10: the OPTIONS row of the
reference screenshot, the menu's slide and fade, the round-boundary close, a playing vocal's moving source, the
random sequence, where the original turns a slot's HudCLOC key into text, and `mp_seal6`'s missing first vocal on
MP71/72/73 (reported, never substituted). The taunts are not copied into the server-side account (the original
never did; moderation of taunt text is the owner's question).

- [Disc evidence, readings and gaps](research/301-original-taunts.md)
- [The plan and its Log](plans/2026-10-06-original-taunts.md)
- [The playtest checklist](taunts-playtest.md)
