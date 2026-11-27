import './deployPanel.css';   // the panel's look, by class (no inline colour or type: the viewer chrome's rule)
import { esc } from './icons';

/**
 * WM-37, the shared DEPLOYING panel (the owner, 2026-11-15, verbatim: "12 b approved on both" -- MEGA-MOCK call 12B,
 * the look prototype at `agent/spc-mega-mock-launch` d16e9705b4, built for real with no look switch; a BROWSER
 * ADAPTATION, product track): ONE drawing of the launcher's DEPLOYING panel -- the kicker after its gold rule, the head
 * with the title, the bar with its glowing head, the status line, the step rail, the foot line -- used by both of OUR
 * deploying layers:
 * - the direct link's cover (`../lobbyLinkCover`, through `../loadIn` `loadInPanelHtml`), and
 * - the launcher's own DEPLOYING hand-over (`./render/overlay` `launchHtml`).
 * It draws nothing of the disc's: the game's own screens (its title, LOGIN, the lobby, the match's loading screen,
 * `../loadingPanel`) are never drawn, framed or overlaid by it. Every value of its look is the design system's
 * (`./deployPanel.css`); the only inline styles are its own `--dp-*` custom properties (a share, a fill, a stagger
 * index), never a colour or a type. Nothing here plays a sound.
 */

export type DeployStepState = 'done' | 'now' | 'next';
export interface DeployStep { label: string; state: DeployStepState }
export interface DeployPanel {
  /** The small gold line over the title, after its gold rule. */
  kicker: string;
  title: string;
  /** The title's id (a dialog's `aria-labelledby`). */
  titleId?: string;
  /** Trusted markup beside the title in the head (the hand-over's close button). */
  close?: string;
  /** A class the head also carries (the hand-over's `cx-launch__head`, the console's head layout). */
  headClass?: string;
  /** The bar's share (0..1), or null for an indeterminate wait (the ordinary route knows no share). */
  share: number | null;
  /** The status line: what is happening now. */
  line: string;
  steps: readonly DeployStep[];
  /** The foot line: what comes after, plainly. */
  foot: string;
  /** A class the foot also carries (the hand-over's `cx-launch__note`). */
  footClass?: string;
  /** The panel's first draw: its parts rise in, staggered (a redraw at the next stage does not replay it). */
  enter?: boolean;
  /** Trusted markup after the foot (the hand-over's error line and its Back button). */
  after?: string;
}

/** A done step's mark: a check; the others their number. */
export const DEPLOY_DONE_MARK = '✓';

const clamp = (x: number): number => Math.max(0, Math.min(1, x));

/** The panel's markup: one root, `.dp`; each part its stagger index (`--dp-i`) for the entrance. */
export function deployPanelHtml(p: DeployPanel): string {
  const now = Math.max(0, p.steps.findIndex((s) => s.state === 'now'));
  const fill = p.steps.length > 1 ? now / (p.steps.length - 1) : 0;
  const bar = p.share === null
    ? '<span class="dp__bar is-waiting" aria-hidden="true" style="--dp-i: 2"><i></i></span>'
    : `<span class="dp__bar" aria-hidden="true" style="--dp-i: 2; --dp-share: ${clamp(p.share)}"><i></i></span>`;
  const steps = p.steps.map((s, i) =>
    `<li class="dp__step is-${s.state}"><span class="dp__node" aria-hidden="true">${s.state === 'done' ? DEPLOY_DONE_MARK : String(i + 1)}</span><span class="dp__label">${esc(s.label)}</span></li>`).join('');
  const i = (n: number): string => ` style="--dp-i: ${n}"`;
  return `<div class="dp${p.enter ? ' is-entering' : ''}" data-steps="${p.steps.length}">`
    + `<span class="dp__kicker"${i(0)}>${esc(p.kicker)}</span>`
    + `<div class="dp__head${p.headClass ? ` ${p.headClass}` : ''}"${i(1)}><h2 class="dp__title"${p.titleId ? ` id="${esc(p.titleId)}"` : ''}>${esc(p.title)}</h2>${p.close ?? ''}</div>`
    + bar
    + `<p class="dp__line" data-part="line"${i(3)}>${esc(p.line)}</p>`
    + `<ol class="dp__steps" style="--dp-i: 4; --dp-fill: ${fill}">${steps}</ol>`
    + `<p class="dp__foot${p.footClass ? ` ${p.footClass}` : ''}"${i(5)}>${esc(p.foot)}</p>`
    + (p.after ?? '')
    + '</div>';
}

/** The steps for a list of labels with `now` the current one (before it done, after it next). */
export function deploySteps(labels: readonly string[], now: number): DeployStep[] {
  return labels.map((label, i) => ({ label, state: i < now ? 'done' : i === now ? 'now' : 'next' }));
}
