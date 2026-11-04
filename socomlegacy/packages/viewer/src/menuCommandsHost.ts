import { Libmc, type CardSlots } from '@s2u/card';
import { DesktopScreen, MenuCommands, registerMainUiVars, type FrontEndMachine, type UiCommandHost, type UiVarManager, type ZAnimUiCommand } from '@s2u/ui';
import { pageCard } from './pageStore';

/**
 * MENU-01a's rows connected on the page (web research 138 §4): `@s2u/ui`'s `MenuCommands` -- the main menu's and the
 * online entry's commands -- registered in PLAT-08's host over the page's virtual card. The card rows go through
 * PLAT-26a's `Libmc` over PLAT-25's slot store (`pageStore.ts`'s `pageCard`: port 0 is slot 1, port 1 slot 2), which
 * already has the shape `MenuCardIo` asks for; the save header's text (`GetNumSavedGames`) waits for MENU-13's reader.
 * `MEMCARD_ERROR` goes into the dialog host built now, as `FUN_001f3bf0(0x408538, ..)` posts it into G. The IOP reboot
 * and the mission allocator's sweep have no page half (research 138 §5's placeholders).
 *
 * The same call sets PLAT-28's desktop-recompilation screen in the host (web research 142 §6): MENU-03's and MENU-08's
 * hooks on the main menu's NEW GAME, LOAD GAME, OPTIONS, EXTRAS and LAN items (`DESKTOP_SCREEN_HOOKS`), a binding gate
 * that opens the notice in place of the item's chain (OT.R5) -- a browser adaptation, the original has no such screen.
 *
 * The game's main registers
 * `VERSION_STRING` in the one UI variable manager before the first frame (D:L47871-47872; `@s2u/ui`'s `MAIN_UI_VARS`):
 * done here, the page's first hook that holds the manager (MENU-02a: the main menu's `VERSION` text shows it).
 */
export interface MenuCommandsHostOptions {
  machine: () => FrontEndMachine;
  uiVars: UiVarManager;
  /** The slot store the libmc is made over (the page's `pageCard` by default); null: no card (every port empty). */
  card?: CardSlots | null;
  /** Where libmc's `[mc]` lines go (the console by default: the FAILED line is always written, research 134 R238). */
  log?: (line: string) => void;
}

/**
 * The commands made and registered in `host`, and PLAT-28's screen set as its binding gate; answered so the page can
 * hand the card's libmc to a later screen and a later task can register its hook (`desktop.hooks.register`).
 */
export function connectMenuCommands(host: UiCommandHost, o: MenuCommandsHostOptions): { commands: MenuCommands; libmc: Libmc | null; desktop: DesktopScreen } {
  registerMainUiVars(o.uiVars);                                      // MENU-02a: VERSION_STRING in the one manager before the first frame
  const slots = o.card === undefined ? pageCard : o.card;
  const libmc = slots ? new Libmc(slots, { log: o.log ?? ((line) => console.warn(line)) }) : null;
  const commands = new MenuCommands({
    valves: () => o.machine().valves,
    uiVars: o.uiVars,
    inputString: (cmd: ZAnimUiCommand) => o.machine().shell()?.inputString(cmd.anim) ?? null,
    event: (kind) => { o.machine().shell()?.event(kind); },
    card: libmc ?? undefined,
  });
  commands.register(host);
  const desktop = new DesktopScreen({ machine: o.machine });
  desktop.register(host);
  return { commands, libmc, desktop };
}
