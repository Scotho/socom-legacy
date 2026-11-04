/**
 * The controls a dialog's focus moves over (LU-4a of `docs/plans/2026-10-09-modern-ui-parallel.md`; MU.R18, MU.R20; the
 * brief `docs/plans/briefs/modern-ui-launcher-layout.md` 2.9's dialogs row). A browser adaptation (MU.R1): the overlay's
 * Tab trap reads it (`./overlay/index`).
 *
 * CX-26 (the console plan): the dialogs' focus model that lived here (`dialogFocus`: the trap, Escape as a dialog's
 * cancel, the focus given back) is retired with its only readers, the USER AGREEMENT's #763 question
 * (`./agreement/agreement` `agreementPanel`) and the #793 log-off confirm (`./logoff` `logoffConfirm`), and with it the
 * on-screen keyboard (`./osk`), which only `dialogFocus` kept running. The console's dialogs and keyboard are its own.
 */

/** The controls a dialog's focus moves over: enabled, not hidden, in the reading order. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, a[href], [tabindex]'))
    .filter((el) => el.tabIndex >= 0 && !el.matches(':disabled, [type="hidden"]') && !el.closest('[hidden], [inert]'));
}
