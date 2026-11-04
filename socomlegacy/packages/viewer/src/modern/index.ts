/**
 * The modern UI's shared types (MU-1 of `docs/plans/2026-10-09-modern-ui-parallel.md`; OV-1). A browser adaptation
 * (MU.R1): it changes nothing of the original's screens, flow, wire or behaviour.
 *
 * **CX-25** (the console plan; CX-13's carry): this module was the modern shell -- `mountShell`, the setup page's top bar
 * account, the sign-in panel and the dialogs over the sections, and `mountSections`, which mounted Home, Play online's
 * news, Server status, Settings and Replays from a `LauncherContext`. No page has mounted either since OVERLAY-CONSOLE
 * (#259): the overlay draws the console launcher itself (OT.R60 (c)), and the import graph walked from every entry
 * reaches neither (the console plan's Log, CX-25). The shell, its sections and the modules only it mounted are retired;
 * what stays here is the type the kept modules still import, with no code: `LauncherContext`, which the overlay hands its
 * Report (`./overlay` -> `./report`), with its `LauncherMode` (the Report writes `mode` into its context line). CX-27:
 * `ShellSectionId` and `LauncherContext.open`, which named a section to open, are retired -- no reader opens one
 * (`./home/cards`' `HomeAction`, which also named them, went with CX-26). CX-29: `signIn`, `signOut` and `pad` are
 * retired too -- the overlay's Report, the one reader, reads `mode`, `state` and `session` only. CX-30: so are the
 * last three optional fields, `roundRunning` (passed by the overlay, read by none), `onRoundChange` and `servedTree`
 * (set and read by none); the console reads the round through its own page reads (`../console/state`).
 */
import type { LauncherState } from './launcherState';
import type { ModernSession } from './session';

/** `setup`: the launcher's page, with its start-only parts; `overlay`: over the game, with none. */
export type LauncherMode = 'setup' | 'overlay';

/**
 * What a modern view is handed (OV-1): the disc's read-only state, the session and where it is mounted. Nothing in it
 * is a page's DOM. The overlay hands one to its Report
 * (`./overlay` -> `./report` `mountReport`, which reads its mode, disc and session).
 */
export interface LauncherContext {
  state: LauncherState;
  session: ModernSession;
  mode: LauncherMode;
}
