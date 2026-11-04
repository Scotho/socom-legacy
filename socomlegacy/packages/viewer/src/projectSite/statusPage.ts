/**
 * The public status page (PST-1; `docs/plans/2026-10-22-public-status.md`). Product track: the project pages' shell,
 * a word and a shape for each state (WCAG 1.4.1), a polite status region that announces a change only (WCAG 4.1.3).
 * Checks run while the tab is visible. A page put in the back-forward cache (a persisted `pagehide`) only suspends its
 * checks and resumes them on the persisted `pageshow` that restores it; a real unload stops them (PR #651 P2). Nothing
 * here is deployed (H295).
 */
import { element, pageShell } from './components';
import { STATUS_LATENCY_BANDS_ADAPTATION, STATUS_POLL_MS_ADAPTATION } from './statusConfig';
import {
  formatChecked, headlineFor, loadStatus, pendingReport, rowDetail, shapeFor, visibleWord,
  type StatusReport,
} from './statusModel';

export interface StatusPageDeps {
  load?: (previous: StatusReport | null) => Promise<StatusReport>;
  /** False in tests and on a development fixture. Default: poll while the tab is visible. */
  poll?: boolean;
  pollMs?: number;
}

const stops = new WeakMap<HTMLElement, () => void>();

/** Stops the page's timer for good. Tests call it; the page also stops on a `pagehide` that is not persisted. */
export function stopStatusPage(root: HTMLElement): void {
  stops.get(root)?.();
}

function announcement(report: StatusReport): string {
  return report.rows.map((row) => `${row.label}: ${visibleWord(row)}`).join('. ');
}

function paint(board: HTMLElement, report: StatusReport): void {
  const list = element('ul', 'project-status-list');
  for (const row of report.rows) {
    const item = element('li', 'project-status-row');
    item.dataset['row'] = row.id;
    item.dataset['service'] = row.service;
    item.dataset['reach'] = row.reach;
    const state = element('p', 'project-status-state');
    const shape = element('span', 'project-status-shape');
    shape.dataset['state'] = shapeFor(row);
    shape.setAttribute('aria-hidden', 'true');
    state.append(shape, element('span', 'project-status-word', visibleWord(row)));
    item.append(element('h3', '', row.label), state, element('p', 'project-status-checked', formatChecked(row.checkedAt)));
    const detail = rowDetail(row, STATUS_LATENCY_BANDS_ADAPTATION);
    if (detail !== '') item.append(element('p', 'project-status-detail', detail));
    list.append(item);
  }
  const headline = board.querySelector('.project-status-headline');
  if (headline) headline.textContent = headlineFor(report.rows);
  const checked = board.querySelector('.project-status-page-checked');
  if (checked) checked.textContent = formatChecked(report.checkedAt);
  board.querySelector('.project-status-list')?.replaceWith(list);
}

export function statusPage(deps: StatusPageDeps = {}): HTMLElement {
  const shell = pageShell('status', 'Is it up?', 'Status', 'Whether the website, the online services and each region’s match server are working, and how fast a match server is from your own device.');
  const main = shell.querySelector('main')!;
  const board = element('section', 'project-status-board');
  const headline = element('p', 'project-status-headline', headlineFor(pendingReport().rows));
  headline.id = 'project-status-headline';
  const checked = element('p', 'project-fine project-status-page-checked', formatChecked(null));
  const list = element('ul', 'project-status-list');
  const live = element('p', 's2u-visually-hidden');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  const refresh = element('button', 's2u-action s2u-action--tertiary', 'Check again');
  refresh.type = 'button';
  board.append(headline, checked, list, live, refresh);
  board.setAttribute('aria-labelledby', headline.id);
  main.append(board);
  paint(board, pendingReport());

  const load = deps.load ?? ((previous: StatusReport | null) => loadStatus({ previous }));
  const poll = deps.poll !== false;
  const pollMs = deps.pollMs ?? STATUS_POLL_MS_ADAPTATION;
  let previous: StatusReport | null = null;
  let announced: string | null = null;
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  /** In the back-forward cache: no timer, the state kept, resumed by a persisted `pageshow`. */
  let suspended = false;

  const arm = (): void => {
    if (!poll || stopped || suspended || document.visibilityState === 'hidden') return;
    clearTimeout(timer);
    timer = setTimeout(() => { void run(); }, pollMs);
  };

  async function run(): Promise<void> {
    if (stopped || busy) return;
    busy = true;
    clearTimeout(timer);
    try {
      const report = await load(previous);
      if (stopped) return;
      previous = report;
      paint(board, report);
      const line = announcement(report);
      if (announced === null) announced = line;
      else if (line !== announced) { live.textContent = line; announced = line; }
    } catch {
      if (stopped) return;
      const report = deriveBlind(previous);
      previous = report;
      paint(board, report);
    } finally {
      busy = false;
      arm();
    }
  }

  refresh.addEventListener('click', () => { void run(); });
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') { clearTimeout(timer); return; }
    void run();
  };
  if (poll) document.addEventListener('visibilitychange', onVisibility);
  const stop = (): void => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
  };
  // `persisted` is true when the page enters (pagehide) or leaves (pageshow) the back-forward cache.
  const onPageHide = (event: PageTransitionEvent): void => {
    if (!event.persisted) { stop(); return; }
    suspended = true;
    clearTimeout(timer);
  };
  const onPageShow = (event: PageTransitionEvent): void => {
    if (!event.persisted || stopped || !suspended) return;
    suspended = false;
    void run();
  };
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  stops.set(shell, stop);
  void run();
  return shell;
}

/** A thrown check is the same as every fetch failing: the player's connection, not a global outage. */
function deriveBlind(previous: StatusReport | null): StatusReport {
  const at = Date.now();
  return {
    checkedAt: at,
    rows: (previous?.rows ?? pendingReport().rows).map((row) => ({
      ...row,
      service: 'unknown' as const,
      reach: 'unreachable' as const,
      checkedAt: at,
      latencyMs: null,
      probe: 'off' as const,
      stale: false,
    })),
  };
}
