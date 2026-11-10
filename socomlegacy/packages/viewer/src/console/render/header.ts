import { pageVersion } from '../pageVersion';
import { DISCORD_INVITE, DISCORD_LABEL, discordMark } from '../discord';
import { esc, ico, shoulder } from '../icons';
import { CATS, homeItems, SAMPLE_DATA, type Adapters, type ConsoleState } from '../state';
import { clock24 } from './theme';

/**
 * LR-1 (LR.R8): the brand header's clock, the artifact's (`S2-Launcher-v2.dc.html`: the date at 14px and 60%, the time at
 * 22px light, the colon blinking each second, the words re-read every 15 s): 24-hour by default, the 12-hour with AM / PM
 * after the minutes; the date in the player's own locale. A browser adaptation.
 */
export const CLOCK_TICK_MS = 15_000;

/**
 * RB-29 (the replay batch; the owner's "S2 Launcher v2" export, its header `D:28`): the brand is the project's logo PNG,
 * 38 px tall with its drop shadow (`console.css`, the header section), in place of the emblem and the SOCOM II / LEGACY
 * words. The file is Phil's wordmark (`shared/brand/socom-legacy-wordmark.png`) at the design's 480 x 174, its alt text
 * the design's. RB.R9 Q1 reads the design as superseding LR.R9's brand clause, the owner to confirm (the plan's Q14). A
 * browser adaptation: the launcher's look, nothing of the game.
 */
export const BRAND_LOGO_URL = new URL('../../../../../../shared/brand/socom-legacy-logo.png', import.meta.url).href;
export const BRAND_LOGO_ALT = 'SOCOM Legacy';

export function clockParts(now: Date, h24: boolean): { date: string; h: string; m: string; ampm: string; iso: string } {
  const hh = now.getHours();
  const m = String(now.getMinutes()).padStart(2, '0');
  return {
    date: now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
    h: h24 ? String(hh).padStart(2, '0') : String(hh % 12 || 12),
    m,
    ampm: h24 ? '' : hh < 12 ? 'AM' : 'PM',
    iso: `${String(hh).padStart(2, '0')}:${m}`,
  };
}

function clockHtml(now: Date, h24: boolean): string {
  const c = clockParts(now, h24);
  return `<div class="cx-clock" role="group" aria-label="Date and time"><span class="cx-clock__date" data-clock-date>${esc(c.date)}</span><time class="cx-clock__time" datetime="${c.iso}"><span data-clock-h>${c.h}</span><span class="cx-clock__colon" aria-hidden="true">:</span><span data-clock-m>${c.m}${c.ampm ? ' ' + c.ampm : ''}</span></time></div>`;
}

/** The running clock, by document: the header it serves and the latest draw's 12 / 24-hour read. */
const clocks = new WeakMap<Document, { head: HTMLElement; h24: () => boolean }>();

/**
 * Keeps the header's clock true between draws: every CLOCK_TICK_MS its words are written again in place (no redraw). The
 * tick serves the header it started for and ends when that header is gone (the hand-over, or the page taken down); a new
 * page's header gets its own.
 */
export function keepClock(doc: Document, h24: () => boolean): void {
  const head = doc.getElementById('header');
  if (!head) return;
  const running = clocks.get(doc);
  if (running && running.head === head) { running.h24 = h24; return; }
  const entry = { head, h24 };
  clocks.set(doc, entry);
  const tick = (): void => {
    if (!entry.head.isConnected || clocks.get(doc) !== entry) { if (clocks.get(doc) === entry) clocks.delete(doc); return; }
    const c = clockParts(new Date(), entry.h24());
    const put = (sel: string, text: string) => { const el = entry.head.querySelector(sel); if (el && el.textContent !== text) el.textContent = text; };
    put('[data-clock-date]', c.date);
    put('[data-clock-h]', c.h);
    put('[data-clock-m]', c.m + (c.ampm ? ' ' + c.ampm : ''));
    entry.head.querySelector('.cx-clock__time')?.setAttribute('datetime', c.iso);
    setTimeout(tick, CLOCK_TICK_MS);
  };
  setTimeout(tick, CLOCK_TICK_MS);
}

/**
 * The ConsoleHeader (the S2U Briefing design system's prototype, `renderHeader`): the emblem and wordmark left; the
 * pad and microphone lamps, the Discord link (LATER 291) and the player card right. The "Prototype states" tag shows
 * only while the sample adapters are in (`SAMPLE_DATA`). A browser adaptation with no original (OT.R28).
 *
 * LATER 291: the pad reaches Discord as Home's last row. On a wide layout that stop is this header icon (the list row
 * is hidden). At the phone rule the list row is the stop, so the icon takes no pad ring.
 */
function discordPad(s: ConsoleState, a: Adapters, narrow: boolean): boolean {
  if (narrow || s.screen !== 'home' || s.overlay || CATS[s.cat]?.id !== 'home') return false;
  return homeItems('home', s, a)[s.item[s.cat] ?? 0]?.act === 'discord';
}

/**
 * LR-33 (LR.R27 and (a), the owner's ruling and the dispatcher's reading): the header's version label. Central's version
 * when it answered (`central`) -- alone when it is the page's too, else "central v0.3.4 / page v0.3.3" -- and the page's
 * own build version while central is unreachable (`central` null), `reached` false so the badge is drawn greyed. The
 * words only: a leading "v" on either is not a difference.
 */
export function versionLabel(page: string, central: { kind: 'version' | 'release'; version: string } | null): { text: string; reached: boolean } {
  const bare = (v: string): string => v.replace(/^v/i, '');
  if (central === null) return { text: `v${bare(page)}`, reached: false };
  // Only a release name (a date-sha): shown alone -- it is not a version to compare with the page's.
  if (central.kind === 'release') return { text: central.version, reached: true };
  return bare(central.version) === bare(page)
    ? { text: `v${bare(central.version)}`, reached: true }
    : { text: `central v${bare(central.version)} / page v${bare(page)}`, reached: true };
}

/**
 * LR-37 (5; the owner, 2026-10-29: "Add a status icon for Server status on the front page (subtle)."): the server's state
 * as the server adapter reads it (`status()`), by the Server screen's tone rule (`./server` `statusTone`): ready online,
 * `alert: false` still checking, else unreachable. A browser adaptation.
 */
export type ServerMark = 'online' | 'checking' | 'unreachable';
export const serverMark = (st: ReturnType<Adapters['server']['status']>): ServerMark => (st.ready ? 'online' : st.alert === false ? 'checking' : 'unreachable');
const SERVER_MARK_WORDS: Readonly<Record<ServerMark, string>> = { online: 'Online', checking: 'Checking', unreachable: 'Unreachable' };

/** LR-37 (5): the brand row's small mark after the version badge -- on Home only (LR-39: the overlay's too); its words its label. */
function serverMarkHtml(s: ConsoleState, a: Adapters): string {
  // LR-40 (8; the controller's decision 4b, LR.R31 (a)): the Home category only -- not Profile, Settings, Online or
  // Experiments on the crossbar (the close run's F12); LR-39 (LR.R32): the overlay's Home is the page's, its mark too.
  if (s.screen !== 'home' || CATS[s.cat]?.id !== 'home') return '';
  const st = a.server.status();
  const k = serverMark(st);
  return `<span class="cx-srvmark is-${k}" role="img" aria-label="Server status: ${SERVER_MARK_WORDS[k]}" title="${esc(`Server: ${st.line}`)}">${ico('server')}<i class="cx-srvmark__dot" aria-hidden="true"></i></span>`;
}

export function headerHtml(s: ConsoleState, a: Adapters, narrow = false, now: Date = new Date()): string {
  const signedIn = a.session.signedIn();
  const persona = a.session.persona();
  const proto = a.data === SAMPLE_DATA && a.states
    ? '<button class="cx-proto" type="button" data-act="states" title="Prototype only: switch disc, sign-in and controller states (P)">Prototype states</button>'
    : '';
  // OVERLAY-CONSOLE (MU2.R3): over a game page the console's close (Circle's, for the pointer). The seat's frames' F-A: a
  // compact legend-style prompt -- the opening button's cap and "Back to game" -- its full name (and a development build's
  // F9, OT.R29) in its label, so the header reads as the launcher's own, one line each; the adaptation's label is the
  // legend's line (`./legend`).
  const toggle = s.page?.toggleName?.() ?? '';
  const cap = s.page?.toggleCap?.() ?? '';
  const label = `Back to game${toggle ? ` (${toggle})` : ''}`;
  const over = s.mode === 'overlay'
    ? `<button class="cx-prompt cx-overlayclose" type="button" data-act="press" data-b="circle" data-overlay-close aria-label="${esc(label)}" title="${esc(label)}">${cap ? `<span class="cx-shoulders" aria-hidden="true">${shoulder(esc(cap))}</span>` : ''}<span class="cx-label">Back to game</span></button>`
    : '';
  const account = `<div class="cx-account-menu"><details data-key="account-menu"${s.accountOpen ? ' open' : ''}>
    <summary data-act="accountmenu" aria-expanded="${s.accountOpen}" aria-controls="cx-account-actions" class="cx-player ${signedIn ? '' : 'is-out'}" aria-label="${signedIn ? 'Account: ' + esc(persona) : 'Profile options'}">
      <span class="cx-player__tile">${ico('user')}<i class="cx-player__dot${signedIn ? ' is-on' : ''}" aria-hidden="true"></i></span><span class="cx-player__name">${signedIn ? esc(persona) : 'Sign in'}</span>${ico('right')}
    </summary>
    <nav id="cx-account-actions" aria-label="Profile options"><ul>${homeItems('profile', s, a).map((x, i) => `<li><button type="button" data-act="profileitem" data-i="${i}" class="${x.disabled ? 'is-disabled' : ''}">${ico(x.icon)}<span class="cx-account-menu__label">${esc(x.title)}</span></button></li>`).join('')}</ul></nav>
  </details></div>`;
  const central = a.server.centralVersion?.() ?? null;
  const version = pageVersion();                                     // LR-40 (6): the build's release, not the package's 0.1.0
  const ver = versionLabel(version, central);
  const bare = (v: string): string => v.replace(/^v/i, '');
  const versionAria = central === null ? `Version ${version}`
    : central.kind === 'release' ? `Release ${central.version}`
      : ver.text.startsWith('central') ? `Version: central ${bare(central.version)}, page ${version}` : `Version ${bare(central.version)}`;
  return `
    <div class="cx-header__identity"><div class="cx-brand"><img class="cx-brand__logo" src="${esc(BRAND_LOGO_URL)}" alt="${BRAND_LOGO_ALT}" width="480" height="174" decoding="async" draggable="false"><span class="cx-version${ver.reached ? '' : ' is-unreached'}" aria-label="${esc(versionAria)}">${esc(ver.text)}</span>${serverMarkHtml(s, a)}</div></div>
    <div class="cx-status">
      ${over}
      ${proto}
      ${s.mode === 'overlay' ? '' : clockHtml(now, clock24(a))}
      <a class="cx-discord${discordPad(s, a, narrow) ? ' is-focused' : ''}" href="${DISCORD_INVITE}" target="_blank" rel="noopener noreferrer" aria-label="${esc(DISCORD_LABEL)}">${discordMark()}</a>
      ${account}
    </div>`;
}
