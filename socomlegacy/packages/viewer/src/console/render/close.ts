/**
 * MODAL-CLOSE (the console launcher plan; the owner, 2026-10-17: "all modal popups (SERVER NEWS, SIGN IN, etc) all need a
 * close button and escape functionality to close it"; MISSION OT.R62): the close button every console dialog carries in
 * its head, for the pointer and touch -- an "×" named Close. It presses Circle (`data-act="press"`, as the legend's
 * prompts do), so it does what Circle does in that dialog: on a confirm No, the safe answer; on the agreement Decline's
 * question; on the extraction's popover its cancel; on the launch screen Back to the launcher. The pad's Circle and the
 * keyboard's Escape (`../input`, every build) do the same. A browser adaptation with no original (OT.R28).
 */

/** The close button's accessible name. */
export const CLOSE_LABEL = 'Close';

/** The close button (`data-close`), Circle's press. */
export const closeButtonHtml = (): string =>
  `<button type="button" class="cx-dialog__close" data-act="press" data-b="circle" data-close aria-label="${CLOSE_LABEL}"><span aria-hidden="true">×</span></button>`;

/**
 * A dialog's head: its title (`titleHtml`, already escaped; `id` its id, the dialog's `aria-labelledby`) and the close
 * button beside it. `block` is the dialog's class (`cx-dialog`, or the launch screen's `cx-launch`): the head is
 * `<block>__head`, the title keeps its own `<block>__title`. `lx` (LR-9): the title is also the panel head's `.cx-title`.
 */
export const dialogHeadHtml = (titleHtml: string, id: string, block: 'cx-dialog' | 'cx-launch' = 'cx-dialog', lx = false): string =>
  `<div class="${block}__head"><h2 class="${block}__title${lx ? ' cx-title' : ''}" id="${id}">${titleHtml}</h2>${closeButtonHtml()}</div>`;
