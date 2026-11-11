import { DISCORD_INVITE, DISCORD_LABEL, discordMark } from '../discord';
import { esc, ico } from '../icons';
import {
  CATS, COMING_WORD, themePicks, DISC_SOURCES, discSource, homeItems, overlayDiscUse, selectedRoom, type Adapters, type ConsoleState, type HomeItem,
  DEPLOY_NEED_LINES, deployChecks, inputReady, launchCheckTitle, LAUNCH_DEPLOY_ROW, LAUNCH_DISC_ROW, LAUNCH_PAD_ROW, LAUNCH_PADSET_ROW, LAUNCH_SEND_ROW, LAUNCH_SHARE_ROW, LAUNCH_SKIP_ROW, playNeed,
  sendState, sendInMenu, SEND_MENU_ROW,
} from '../state';
import { SKIP_MENU_HINT, SKIP_MENU_LABEL, SKIP_MENU_ROW, skipMenuOn } from '../skipMenu';
import { SEND_MENU_LABEL, SEND_ROW_LABEL, SEND_TITLE, SHARE_ROW_LABEL, SHARE_TITLE, SHARE_XBOX_POINTER } from '../../discShareWords';
import { sendAreaHtml, shareAreaHtml, shareRowLine } from './discShare';
import { screenHead } from './head';
import { markEdges } from './options';
import { rowHtml, type Row, type RowOpts } from './rows';

/**
 * The crossbar home (the S2U Briefing design system's prototype, `renderHome` and `readout`; its Crossbar, ActionList
 * and Readout READMEs): the categories across (CX.R14: Home, Play online, Replays, Profile, Settings, Experiments), the
 * current one's actions below (its readout beside them is gone: LR-23 on the page, LR-39 in the overlay). A browser
 * adaptation with no original (OT.R28).
 */

/**
 * OVERLAY-CONSOLE (MU2-12, MU2.R6: the disc as the page reports it, followed): the overlay's disc line, read only. Since
 * batch B's review F2 (the seat's frames F-B) the game running under the overlay has a disc, so the line says it in use --
 * by its words (an image, a folder, the kept read set), the served tree, or unnamed -- with the check and the ready style,
 * never "No disc in"; reading and a refusal as before; on the disc page before its image, none chosen yet
 * (`../state` `overlayDiscUse`).
 */
export function overlayDiscLine(s: ConsoleState, a: Adapters): { state: 'in' | 'reading' | 'error' | 'served' | 'game' | 'none'; text: string; ok: boolean } {
  const use = overlayDiscUse(s, a);
  return { state: use.state, text: use.line, ok: use.ok };
}

/**
 * LR-2's and LR-13's "Before you deploy" panel (Play's checks, Deploy, "On the server now") and LR-21's right sheet it
 * opened as are gone: LR-23 (LR.R22, the owner: "The entire right side overlay for the selected category - gone").
 */

/**
 * LR-36 (LR.R30, the owner, 2026-10-28: "pressing PLAY SOCOM 2 while controller is not connected was meant to bring up the
 * right aligned pre-launch UI that the mockup contained"): Play's "Before you deploy" panel, opened by Play's Cross when Play
 * is not ready -- no controller, or (the LR-36 fold) the disc out, refused or still read (`../grammar` `openCheck`) --
 * never a standing panel beside the list (LR.R22 stands for Home at rest). The
 * mockup's (S2 Launcher v2.dc.html: `openCheck`, its panel `launch`, "CHK", "Before you deploy"; `case 'launch'`): a check
 * row for the disc, one for the controller ("No controller found / Press any button"), a spacer, Deploy (primary when Play
 * launches; else muted, its line what it needs -- LR.R30, the dispatcher's reading: no "Deploy with keyboard"), and the link
 * "Controller settings" (Settings > System Settings > Controller, where LR-31 went). Drawn in the pushed panels' kind (LR-1's
 * panel head, `./head`, and row kinds, `./rows`) as the mockup's right-aligned panel over the faded rail and list
 * (`../console.css`, LR-36). Every word and state is the launcher's (CX.R5). A browser adaptation: nothing of the game.
 * DSH-5 (DSH.R12, the owner, 2026-10-29): with a disc share adapter, a last row below "Controller settings", "Request Game
 * Files (XBOX)" (the download mark: the files come to this device); activated, the panel widens (`is-share`) and its rows
 * give way to the share's area (`./discShare` `shareAreaHtml`), its head the row's name, its crumb's Back the rows again.
 */
function launchCheckHtml(s: ConsoleState, a: Adapters): string {
  const share = a.discShare;
  // DSH-10 (DSH.R17): the send area, in the receiver's place and width (`is-share`), its head the row's name.
  if (share && s.chk.send) {
    return `<aside class="cx-launchcheck is-share is-send" data-panel="launch" data-key="launchcheck-send" aria-label="${esc(SEND_TITLE)}">
      <div class="cx-screen cx-screen--panel">
        ${screenHead('', SEND_TITLE, launchCheckTitle(s, a), '', '', 2)}
        <div class="cx-screen__body" data-scroll data-key="send-area">${sendAreaHtml(s, share)}</div>
      </div>
    </aside>`;
  }
  if (share && s.chk.share) {
    return `<aside class="cx-launchcheck is-share" data-panel="launch" data-key="launchcheck-share" aria-label="${esc(SHARE_TITLE)}">
      <div class="cx-screen cx-screen--panel">
        ${screenHead('', SHARE_TITLE, launchCheckTitle(s, a), '', '', 2)}
        <div class="cx-screen__body" data-scroll data-key="share-area">${shareAreaHtml(share)}</div>
      </div>
    </aside>`;
  }
  const title = launchCheckTitle(s, a);
  const flip = s.opt.flip;                                           // SKIP-MENU review fold (1): LR-13's flip mark, this one draw
  if (flip === SKIP_MENU_ROW) s.opt.flip = undefined;
  const step = deployChecks(s, a)[0];
  const disc = a.disc.state();
  const pad = inputReady(a);
  const need = playNeed(s, a);
  const room = need === null ? selectedRoom(s, a) : null;
  // Setup onboarding (Trello ZjCZXTTW, the playtest of 2026-11-01: retail disc owners never found the retail disc, reached
  // only by the disc mark's menu): the Disc row carries CX-16's two sources itself, side by side, the active one on --
  // Left / Right on the row switch it (`../grammar` `pressCheck`), a click on one is the menu's option (`pickSource`).
  // Only where the source can be switched (`step.source`, the Disc step's own flag). The disc mark's menu stays.
  const active = discSource(a);
  const choice = step?.source ? { label: 'Disc source', act: 'chksrc', options: DISC_SOURCES.map((o) => ({ label: o.label, on: o.id === active })) } : undefined;
  // Setup onboarding (ZjCZXTTW: Xbox players did not find the share): the disc out on a page with the share's row, the
  // head's one line points at it (`SHARE_XBOX_POINTER`).
  const pointer = share && disc !== 'ready' ? SHARE_XBOX_POINTER : '';
  const rows: [number, Row, Partial<RowOpts>?, string?][] = [
    [LAUNCH_DISC_ROW, { kind: 'check', id: 'disc', label: 'Disc', hint: step?.sub ?? '', icon: 'disc', ok: disc === 'ready', progress: disc === 'ready' ? 1 : disc === 'reading' ? 0.5 : 0, chip: disc === 'ready' ? 'Change' : 'Choose', ...(choice ? { choice } : {}) }],
    [LAUNCH_PAD_ROW, { kind: 'check', id: 'pad', label: 'Controller', hint: pad ? a.controls?.line() ?? 'Controller connected' : 'No controller found · Press any button', icon: 'pad', ok: pad, progress: pad ? 1 : 0, chip: pad ? 'Connected' : 'Not found' }],
    [-1, { kind: 'header', label: '' }],
    [LAUNCH_DEPLOY_ROW, { kind: 'action', id: 'deploy', label: 'Deploy', hint: need ? DEPLOY_NEED_LINES[need] : room ? `Launch target: room ${room.name}` : 'Ready to deploy', tone: need ? 'muted' : 'primary' }],
    [LAUNCH_SKIP_ROW, { kind: 'toggle', id: 'skipmenu', label: SKIP_MENU_LABEL, hint: SKIP_MENU_HINT, on: skipMenuOn() }],   // SKIP-MENU (LR.R33): the panel's toggle kind, above Controller settings
    [LAUNCH_PADSET_ROW, { kind: 'link', id: 'padsettings', label: 'Controller settings', hint: 'Settings › Launcher › Controller', icon: 'pad' }],   // LR-38 (4): the mockup's link row carries its destination's mark; LATER 294: its path is Launcher's
  ];
  if (share) {
    // DSH-10 (DSH.R17): "Send Game Files", directly above "Request Game Files (XBOX)" -- enabled only on `sendState`
    // (the adapter's `complete()`); disabled it is muted (`aria-disabled`) yet reached by the pad and Tab. Its tooltip is
    // its `title` (the pointer's hover) and the same words in a visually hidden span it names as its description (a pad
    // and the Xbox have no hover).
    const send = sendState(a);
    rows.push([LAUNCH_SEND_ROW, { kind: 'link', id: 'send', label: SEND_ROW_LABEL, hint: send.line, icon: 'upload' },
      { muted: !send.ok, attrs: `title="${esc(send.tip)}" aria-describedby="cx-send-tip"` },
      `<span id="cx-send-tip" class="sr-only">${esc(send.tip)}</span>`]);
    rows.push([LAUNCH_SHARE_ROW, { kind: 'link', id: 'share', label: SHARE_ROW_LABEL, hint: shareRowLine(share), icon: 'download' }]);   // DSH-5 (DSH.R12)
  }
  return `<aside class="cx-launchcheck" data-panel="launch" data-key="launchcheck" aria-label="${esc(title)}">
      <div class="cx-screen cx-screen--panel">
        ${screenHead('', title, 'Home', '', pointer, 2)}
        <div class="cx-screen__body">
          <div class="cx-rlist" data-scroll data-key="rows-launch" role="group" aria-label="${esc(title)}">
            ${rows.map(([i, r, o, after]) => rowHtml(r, { focused: i >= 0 && i === s.chk.row, index: i, act: 'chkrow', flipped: i === LAUNCH_SKIP_ROW && flip === SKIP_MENU_ROW, ...o }) + (after ?? '')).join('')}
          </div>
        </div>
      </div>
    </aside>`;
}

/*
 * The readout beside the list (the prototype's `readout`, `readoutHtml`) is removed: LR-23 (LR.R22) took it from the
 * launcher page's Home and LR-39 (LR.R32) from the overlay's (LR.R18's); the disc in use it said over a game is the legend's
 * disc mark's (`./legend`, `overlayDiscLine` above).
 */

/**
 * CX-16 (CX.R9): the disc source's control on the Disc action's row and, while it is open, its dropdown of the two
 * sources, the active one checked; the pad's focus is on an option then, never on the action. The page's own control
 * (`../console.css`, CX-16 and CX-19): the design export draws no dropdown and no split row for the cx layer.
 * CX-19 (CX.R11, the owner, 2026-10-12: "the disc right aligned option should be a cog, and it should be part of the disc
 * element just partitioned on the right"): the control is the cog (`../icons` P.cog) and the right partition of the Disc
 * row itself (`itemHtml`), not a pill beside it; its words are CX-16's (CX.R5). The cog is out of the Tab order
 * (`tabindex="-1"`, as `./replays` keeps its out-of-order control): the Disc action is the row's one stop, for the pad
 * and for Tab; the pointer, a tap and Square reach the cog (the review of CX-19).
 */
export function sourceHtml(s: ConsoleState, a: Adapters): string {
  const active = discSource(a);
  const label = DISC_SOURCES.find((o) => o.id === active)?.label ?? '';
  const open = s.src.open;
  return `<span class="cx-split__rule" aria-hidden="true"></span><button type="button" class="cx-srcbtn cx-split__cog${open ? ' is-open' : ''}" tabindex="-1" data-act="srcbtn" aria-haspopup="menu" aria-expanded="${open}" aria-label="Disc source: ${esc(label)}">${ico('cog')}</button>
    ${sourceMenuHtml(s, a)}`;
}

/**
 * CX-16's dropdown of the two sources while it is open (else nothing): the cog's (`sourceHtml`) on a game page's
 * overlay, and since LR-24 (LR.R23 (b)) the disc mark's on the launcher page's Home (`./legend`), which has no cog.
 */
export function sourceMenuHtml(s: ConsoleState, a: Adapters): string {
  const active = discSource(a);
  return `${s.src.open ? `<ul class="cx-srcmenu" role="menu" aria-label="Disc source">${DISC_SOURCES.map((o, i) => `<li role="none"><button type="button" class="cx-srcopt${i === s.src.row ? ' is-focused' : ''}" role="menuitemradio" aria-checked="${o.id === active}" data-act="srcopt" data-i="${i}">${ico(o.id === active ? 'check' : 'disc')}<span class="cx-label">${esc(o.label)}</span></button></li>`).join('')}${sendMenuRowHtml(s, a)}</ul>` : ''}`;
}

/**
 * DSH-11 (DSH.R17): the menu's "SEND DISC" -- a `menuitem` (no source to check) with the upload mark, decided by DSH-10's
 * rule (`sendState`): enabled, its press opens Play's panel on the send area; disabled, muted (`aria-disabled`) and its
 * press says why. Either way its `title` is DSH-10's tooltip, and the same words a visually hidden description.
 */
function sendMenuRowHtml(s: ConsoleState, a: Adapters): string {
  if (!sendInMenu(s, a)) return '';
  const st = sendState(a);
  return `<li role="none"><button type="button" class="cx-srcopt cx-srcopt--send${SEND_MENU_ROW === s.src.row ? ' is-focused' : ''}${st.ok ? '' : ' is-muted'}" role="menuitem"${st.ok ? '' : ' aria-disabled="true"'} title="${esc(st.tip)}" aria-describedby="cx-send-menu-tip" data-act="srcopt" data-i="${SEND_MENU_ROW}" data-send="menu">${ico('upload')}<span class="cx-label">${esc(SEND_MENU_LABEL)}</span></button><span id="cx-send-menu-tip" class="sr-only">${esc(st.tip)}</span></li>`;
}

/**
 * LATER 291: Home's Discord row is a real link (the phone's item, under Memory card). On a wide layout the header icon
 * is the pad stop (`./header`), so this row takes no `is-focused` there — a click still follows the href, and the pad's
 * Cross opens the same address (`../grammar`). No second `window.open` on the click.
 */
function discordRowHtml(s: ConsoleState, x: HomeItem, i: number, focused: number, narrow: boolean, view: number): string {
  const lit = narrow && i === focused;
  return `<li class="cx-discord-row"><a class="cx-item${lit ? ' is-focused' : ''}${above(i, view) ? ' is-above' : ''}" href="${DISCORD_INVITE}" target="_blank" rel="noopener noreferrer" aria-label="${esc(DISCORD_LABEL)}" data-act="discord" data-i="${i}" data-fk="home-${s.cat}-${i}">
          <span class="cx-item__icon">${discordMark()}</span>
          <span class="cx-item__text"><span class="cx-item__title">${esc(x.title)}</span><span class="cx-item__sub">${esc(x.sub)}</span></span>
        </a></li>`;
}

/**
 * LR-23 (LR.R22; the mockup's list, S2 Launcher v2.dc.html line 946: `i < sel - 1 ? 0`): on the launcher page's Home a
 * row above the one before the focused one is hidden as the list moves up (`../console.css`, the `--cx-list-shift` the
 * list carries); since LR-39 (LR.R32) on the overlay's Home too (it is the page's).
 */
const above = (i: number, focused: number): boolean => i < focused - 1;

/**
 * One action of the list (the ActionList README's item). The Disc action's row is split (CX-19): the li is the row's one
 * box -- the action, a divider, the cog partition -- lit as a focused item is (`is-lit`, `../console.css`) while the
 * action has the focus, so the frame and the pad's ring enclose both; the action stays the row's one focus stop.
 */
function itemHtml(s: ConsoleState, a: Adapters, x: HomeItem, i: number, focused: number, narrow: boolean, view: number): string {
  if (x.act === 'discord') return discordRowHtml(s, x, i, focused, narrow, view);
  // CX-16: one focus -- while the source's dropdown is open its option has it, not the item (LR-23: on the launcher page the
  // dropdown hangs from the legend chip's cog, whichever item is focused; LR-39: the overlay's Home is the page's).
  // LR-36: while Play's launch check is open its row has the focus, not the item.
  const lit = i === focused && !s.src.open && !s.chk.open;
  const status = x.title === 'Disc' ? { kind: 'disc', tone: a.disc.state() === 'ready' ? 'ready' : a.disc.state() === 'reading' ? 'warning' : 'danger' }
    : x.title === 'Controller' ? { kind: 'pad', tone: a.pad.connected() ? 'ready' : 'danger' }
    : x.act === 'mic' ? { kind: 'mic', tone: a.mic.on() && !a.mic.refused?.() ? 'ready' : 'warning' } : null;
  // LR-23 (LR.R22: "The Play caution icon? not great"): LR-13's state dot on Play is gone; Play's readiness is the
  // legend's status chip and its Cross word. Play's row is marked for its larger mark (the mockup's 62px); LR-39 (LR.R32):
  // the overlay's Resume game, in Play's place, is drawn as Play's row.
  const play = x.act === 'play' || x.act === 'resume' ? ' cx-item--play' : '';
  // LR-13 (LR.R16 (2)): the Theme item's drop-up: while it is open the focus is the option's, never the item's.
  const drop = x.act === 'themes' && s.thm.open && i === focused;
  // LR-20 (P12): a tag (WIP, COMING) follows the title in its line (`has-tag`, ../console.css); a readiness state
  // (READY, NEEDED) keeps the row's far column.
  const word = x.state && x.state[0] ? `<span class="cx-item__state ${x.state[1] ? 'is-' + x.state[1] : ''}">${esc(x.state[0])}</span>` : '';
  const tag = !!word && (x.state![1] === 'tag' || x.state![0] === COMING_WORD);
  if (drop) return themeItemHtml(s, a, x, i);
  return `<li${x.act === 'signout' || x.title === 'Sign out' ? ' class="cx-signout-row"' : ''}${x.source ? ` class="cx-srcrow cx-split${lit ? ' is-lit' : ''}"` : ''}><button type="button" class="cx-item${play} ${lit ? 'is-focused' : ''}${above(i, view) ? ' is-above' : ''}${tag ? ' has-tag' : ''} ${x.disabled ? 'is-disabled' : ''} ${status ? 'cx-status--' + status.tone : ''}"${status ? ` data-status="${status.kind}"` : ''} data-act="item" data-i="${i}" data-fk="home-${s.cat}-${i}">
          <span class="cx-item__icon">${ico(x.icon)}</span>
          <span class="cx-item__text"><span class="cx-item__title">${esc(x.title)}</span>${tag ? word : ''}<span class="cx-item__sub">${esc(x.sub)}</span></span>
          ${tag ? '' : word}
        </button>${x.source ? sourceHtml(s, a) : ''}</li>`;
}

/**
 * LR-13 (LR.R16 (2), the owner: "Settings' third item is a drop-up that changes the theme directly"): the Theme item
 * with its drop-up open over it -- a listbox of the seven themes (the options adapter's theme picks: their labels and the
 * artifact's three swatches), the current one selected, the pad's one focused; a click on an option applies it
 * (`themeopt`). Anchored on the item's row, opening upward where the rows above fit it and else downward (LR-15, `dropupPlacement`; `../console.css`). The item stays the click target that
 * closes it, out of the focus while the list has it.
 */
/**
 * LR-15 (a browser adaptation: the launcher's look): where the theme list opens. Upward ("drop-up") only where the rows
 * above its row are as many as it has options; otherwise downward into the empty space under the row, so it never
 * climbs over the header or the rail.
 */
export function dropupPlacement(rowsAbove: number, options: number): 'is-above' | 'is-below' {
  return rowsAbove >= options ? 'is-above' : 'is-below';
}

/**
 * LR-18's fold (the seat box's run at 386ecb578: at 1280x720 the list opened below ran 378-623 px against the legend's top
 * at 608): the theme list's height is capped to the room it opens into -- below, from its top to the legend's top; above,
 * from the header's bottom to its bottom -- less its own 0.375rem gap, measured at each draw and set as `--cx-dropup-max`
 * on the root (no region's redraw touches it; `../console.css` reads it and lets the list scroll), and the pad's option is
 * kept in the list's view when it changes (a redraw with the same option keeps the wheel's scroll). Without the list the
 * cap is cleared. A browser adaptation: the launcher's look, nothing of the game.
 * Its second fold (the box's run at f2246b03d: the list still ended 11px into the legend): the room is measured from the
 * Theme row (`.cx-dropup-row`, which does not move) and the list's margin, not from the list, which its opening motion
 * still lifts (or lowers) at the draw that opens it; the cap bounds the list's border box (`../console.css`), so its
 * padding and border are inside it.
 */
const dropupSeen = new WeakMap<Document, number>();
/**
 * LR-20's fold (the box at 406d9e99f: the list's bottom at 612.2 against the legend's top at 608.3, 3.9px into it): the
 * list keeps at least `DROPUP_CLEAR` px from the legend's top (or the header's bottom) as the browser lays them out, the
 * cap a whole pixel down; and once its opening motion has settled (`animationend`) the list's own box is read again and
 * the cap taken down by what it still runs past that line (`dropupTrim`, kept while the list stays open), whatever moved
 * after the draw. Without a layout (no legend box: jsdom) the window's bottom stands for the legend's top.
 */
export const DROPUP_CLEAR = 8;
const dropupTrim = new WeakMap<Document, number>();
const dropupWatched = new WeakSet<HTMLElement>();
const dropupEdged = new WeakSet<HTMLElement>();
/** The line the list must not pass: below, the legend's top less the clearance; above, the header's bottom plus it. */
function dropupLimit(doc: Document, above: boolean): number {
  if (above) return (doc.getElementById('header')?.getBoundingClientRect().bottom ?? 0) + DROPUP_CLEAR;
  const legend = doc.getElementById('legend') ?? doc.querySelector<HTMLElement>('footer.cx-legend');
  const r = legend?.getBoundingClientRect();
  const top = r && (r.height > 0 || r.top > 0) ? r.top : (doc.defaultView?.innerHeight ?? 0);
  return top - DROPUP_CLEAR;
}
/** After the opening motion: the settled list's overrun past its line, taken off the cap. */
function settleDropup(doc: Document, up: HTMLElement): void {
  if (!up.isConnected) return;
  const above = up.classList.contains('is-above');
  const b = up.getBoundingClientRect();
  const over = above ? dropupLimit(doc, true) - b.top : b.bottom - dropupLimit(doc, false);
  if (over <= 0) return;
  dropupTrim.set(doc, (dropupTrim.get(doc) ?? 0) + over);
  fitDropup(doc);
}
export function fitDropup(doc: Document): void {
  const root = doc.documentElement;
  const up = doc.querySelector<HTMLElement>('#stage .cx-dropup');
  const legend = doc.getElementById('legend') ?? doc.querySelector<HTMLElement>('footer.cx-legend');
  if (!up || !legend) {
    if (root.style.getPropertyValue('--cx-dropup-max')) root.style.removeProperty('--cx-dropup-max');
    dropupSeen.delete(doc);
    dropupTrim.delete(doc);
    return;
  }
  const gap = 0.375 * (parseFloat(root.style.fontSize) || 16);
  // The list sits a gap off its row (its margin) and keeps `DROPUP_CLEAR` to the header or the legend.
  const row = (up.closest('.cx-dropup-row') ?? up).getBoundingClientRect();
  const above = up.classList.contains('is-above');
  const room = above ? row.top - gap - dropupLimit(doc, true) : dropupLimit(doc, false) - (row.bottom + gap);
  const cap = `${Math.max(0, Math.floor(room) - Math.ceil(dropupTrim.get(doc) ?? 0))}px`;
  if (root.style.getPropertyValue('--cx-dropup-max') !== cap) root.style.setProperty('--cx-dropup-max', cap);
  if (!dropupWatched.has(up)) { dropupWatched.add(up); up.addEventListener('animationend', () => { settleDropup(doc, up); }); }
  // LR-22 (R6): the list scrolls (it showed 6 of 7 themes with no cue): its scrollable edge is marked and faded (`../console.css`).
  if (!dropupEdged.has(up)) { dropupEdged.add(up); up.addEventListener('scroll', () => { markEdges(up); }, { passive: true }); }
  markEdges(up);
  const f = up.querySelector<HTMLElement>('.cx-dropup__opt.is-focused');
  const k = f ? Number(f.dataset['i']) : -1;
  if (f && dropupSeen.get(doc) !== k) {
    const b = up.getBoundingClientRect();
    const r = f.getBoundingClientRect();
    if (r.top < b.top) up.scrollTop -= b.top - r.top;
    else if (r.bottom > b.bottom) up.scrollTop += r.bottom - b.bottom;
  }
  dropupSeen.set(doc, k);
}

function themeItemHtml(s: ConsoleState, a: Adapters, x: HomeItem, i: number): string {
  const picks = themePicks(a);
  const sw = (r: (typeof picks)[number]): string => (r.pick?.swatch ? `<span class="cx-r__swatches" aria-hidden="true">${r.pick.swatch.map((c) => `<span class="cx-r__swatch" style="background: ${/^#[0-9a-f]{3,8}$/i.test(c) ? c : 'transparent'}"></span>`).join('')}</span>` : '');
  const list = `<ul class="cx-dropup ${dropupPlacement(i, picks.length)}" role="listbox" aria-label="Theme">${picks.map((r, k) => `<li role="none"><button type="button" class="cx-dropup__opt${k === s.thm.row ? ' is-focused' : ''}" role="option" aria-selected="${!!r.pick?.picked}" data-act="themeopt" data-i="${k}">${sw(r)}<span class="cx-dropup__label">${esc(r.label)}</span>${r.pick?.picked ? ico('check') : ''}</button></li>`).join('')}</ul>`;
  return `<li class="cx-dropup-row"><button type="button" class="cx-item is-open" aria-haspopup="listbox" aria-expanded="true" data-act="item" data-i="${i}" data-fk="home-${s.cat}-${i}">
          <span class="cx-item__icon">${ico(x.icon)}</span>
          <span class="cx-item__text"><span class="cx-item__title">${esc(x.title)}</span><span class="cx-item__sub">${esc(x.sub)}</span></span>
        </button>${list}</li>`;
}

/**
 * LR-38 (the owner, 2026-10-29): the phone rule's rail (`data-rail="scroll"`, drawn by `homeHtml`) brings its current
 * category to the strip's centre when the category changes -- a tap on it, the pad's L1 / R1, a deep link -- smoothly, or at
 * once under reduced motion and at the first draw or a new size; a redraw with the same category (a server or status update)
 * moves nothing, so the finger's own scroll stays where it left it. Only the strip's scroll moves, never the stage's or the
 * page's (no `scrollIntoView`). The morph patches the strip in place (`../morph`), so its scrollLeft survives every redraw.
 * A browser adaptation: the launcher's pointer and layout, nothing of the game.
 */
const railSeen = new WeakMap<Document, { cat: string; size: string }>();
/**
 * LR-40 (2; the close run's F2: after a flick the strip rested on an unselected Home, the selected category out of view):
 * the selection stays on the rail's centre (LP.R13), and the rail stays "scrollable ... in a graceful apple-like way"
 * (LR.R31): a scroll that comes to rest -- the finger's flick, its snap -- selects the category it rests on, as a tap on it
 * would (its click: the same select, sound and centring). At rest is the browser's `scrollend`, or where it has none the
 * scroll's `RAIL_SETTLE_MS` without a further scroll event. A rest on the current category (the rail's own centring
 * ending) selects nothing. The fallback (iOS Safari before 26.2 has no `scrollend`; the review's finding 1): a finger on the
 * strip (pointerdown, touchstart) holds it -- a drag held still is no rest, so nothing is selected and nothing is scrolled
 * under the finger -- and its release (pointerup, touchend, touchcancel, wherever it ends) arms the rest.
 * The rail's own centring is no flick (box run 4 at 0b819ef94: launcherPolish.spec:193, a native Tab at 412x915): from
 * `keepRailCentred`'s scroll (a Tab focus, the pad's L1 / R1, a tap, a resize) until a rest lands on the current category,
 * a rest is the centring's, never a selection -- Chromium reported one on the way, Home still at the centre, which clicked
 * Home and left the focused category neither current nor centred. A finger (pointerdown, touchstart) or a wheel on the
 * strip hands the rail back to the person at once. Only a rest on another category clicks it, so a keyboard focus stays
 * on its category. The mark also ends without a rest (box run 5 at 6f5b3b620, a box loaded by another lane: launcherPhoneLr38.spec:60
 * at 375x667 red once, 13/13 twice on a quiet box -- under slow frames the mark could outlive the centring, so a later
 * `scrollBy` flick was ignored): once a scroll reaches the
 * centring's target (within 2px), or `RAIL_DRIVE_MS` after it began, whichever is first; then any scroll's rest counts.
 * When the time ends it on a strip at rest (no scroll for `RAIL_SETTLE_MS`) with the current category off the centre -- a
 * centring cut short, its only rest swallowed while marked (the review's F2) -- the current category is centred again,
 * once (that centring's own time ends nothing more): LP.R13's "the selection stays centred", no selection changed and no
 * focus moved. A browser adaptation: the launcher's pointer, nothing of the game.
 */
export const RAIL_SETTLE_MS = 140;
const railWatched = new WeakSet<HTMLElement>();
/** A strip `keepRailCentred` is scrolling, until it lands (a rest on the current category, its target reached, or
 *  `RAIL_DRIVE_MS`) or a person takes it over. */
const railDriven = new WeakSet<HTMLElement>();
/**
 * The longest a centring holds the mark. Unmeasured (the review's F3): a smooth scroll is a few hundred ms in Chromium,
 * and 1200 ms is headroom over that, chosen, not read; a trace of the box's frames during a centring (its smooth scroll's
 * real duration under load) would settle it.
 */
export const RAIL_DRIVE_MS = 1200;
const railTarget = new WeakMap<HTMLElement, { left: number; timer: ReturnType<typeof setTimeout> }>();
/** When the strip last scrolled (`Date.now()`), for the time-out's "at rest". */
const railScrolled = new WeakMap<HTMLElement, number>();
/** The strip's scrollLeft that puts `cat`'s centre on the strip's. */
function centreLeft(strip: HTMLElement, cat: HTMLElement): number {
  const b = strip.getBoundingClientRect();
  const r = cat.getBoundingClientRect();
  return Math.max(0, strip.scrollLeft + (r.left + r.width / 2) - (b.left + b.width / 2));
}
/** The mark's time ran out: a strip at rest with its current category off the centre is centred again (once). */
function recentre(strip: HTMLElement): void {
  if (!strip.isConnected || strip.dataset['rail'] !== 'scroll') return;
  if (Date.now() - (railScrolled.get(strip) ?? 0) < RAIL_SETTLE_MS) return;          // still moving: its rest decides
  const cat = strip.querySelector<HTMLElement>('.cx-cat.is-current');
  if (!cat) return;
  const left = centreLeft(strip, cat);
  if (Math.abs(left - strip.scrollLeft) <= 2) return;
  const reduced = strip.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  drive(strip, left, false);
  if (typeof strip.scrollTo === 'function') strip.scrollTo({ left, behavior: reduced ? 'instant' : 'smooth' });
  else strip.scrollLeft = left;
}
function undrive(strip: HTMLElement): void {
  const t = railTarget.get(strip);
  if (t) clearTimeout(t.timer);
  railTarget.delete(strip);
  railDriven.delete(strip);
}
function drive(strip: HTMLElement, left: number, retry = true): void {
  undrive(strip);
  railDriven.add(strip);
  railTarget.set(strip, { left, timer: setTimeout(() => { undrive(strip); if (retry) recentre(strip); }, RAIL_DRIVE_MS) });
}
function railSettled(strip: HTMLElement): void {
  if (!strip.isConnected || strip.dataset['rail'] !== 'scroll') return;
  const b = strip.getBoundingClientRect();
  const mid = b.left + b.width / 2;
  let near: HTMLElement | null = null;
  let best = Infinity;
  for (const c of strip.querySelectorAll<HTMLElement>('.cx-cat')) {
    const r = c.getBoundingClientRect();
    const d = Math.abs(r.left + r.width / 2 - mid);
    if (d < best) { best = d; near = c; }
  }
  if (!near) return;
  if (near.classList.contains('is-current')) { undrive(strip); return; }            // the centring landed (or nothing moved)
  if (railDriven.has(strip)) return;                                                   // a rest on the centring's way
  near.click();
}
/**
 * The fallback's release, one set per document (the independent B193 review's F1, `agent-mail/evidence/review-b193-dot-2026-10-31.md`:
 * P2 in its scoped review, P3 in its full report): the document's four release listeners are installed once and act on the watched strip's release only, so no
 * listener piles up. Only one rail strip is ever on the stage. The document holds that strip's release only while the strip
 * is on the stage (LR-45's fold, that review's P3): a newer strip retires it, and so do Home leaving the stage
 * (`keepRailCentred` finding no strip) and the console's disposal (`retireRail`, `../app`) -- its hold and its timers
 * cleared, the entry deleted, so a release then arms nothing and the document keeps no retired strip; a strip back on the
 * stage takes it again (`railHandles`). A browser adaptation.
 */
const railRelease = new WeakMap<Document, { release: () => void; retire: () => void }>();
const railReleaseWired = new WeakSet<Document>();
/** Retires the document's watched strip's release (its hold and rest timer cleared, its centring's mark ended); none, nothing. */
export function retireRail(doc: Document): void {
  const r = railRelease.get(doc);
  if (!r) return;
  railRelease.delete(doc);
  r.retire();
}
/** Whether the document holds a watched strip's release (the tests' read of the retirement). */
export const railReleaseActive = (doc: Document): boolean => railRelease.has(doc);
/**
 * Each fallback strip's own release and retirement. The morph keeps a strip across a rotation round trip (it patches only
 * `data-rail`), and the wide side's `keepRailCentred` retires its release; back at the phone rule the watched strip takes
 * the document's entry again (LR-45 re-review's blocking finding: it never did, so a held finger stayed held).
 */
const railHandles = new WeakMap<HTMLElement, { release: () => void; retire: () => void }>();
function watchRailRest(strip: HTMLElement): void {
  if (railWatched.has(strip)) {
    const h = railHandles.get(strip);                                            // the fallback's, with no scrollend
    const doc = strip.ownerDocument;
    if (h && railRelease.get(doc) !== h) { retireRail(doc); railRelease.set(doc, h); }
    return;
  }
  railWatched.add(strip);
  const person = (): void => { undrive(strip); };                               // a finger or a wheel: the rail is theirs
  for (const t of ['pointerdown', 'touchstart', 'wheel']) strip.addEventListener(t, person, { passive: true });
  strip.addEventListener('scroll', () => {                                       // the centring reached its target
    railScrolled.set(strip, Date.now());
    const t = railTarget.get(strip);
    if (t && Math.abs(strip.scrollLeft - t.left) <= 2) undrive(strip);
  }, { passive: true });
  let rest: ReturnType<typeof setTimeout> | undefined;
  const settle = (): void => { clearTimeout(rest); rest = undefined; railSettled(strip); };
  strip.addEventListener('scrollend', settle, { passive: true });
  if ('onscrollend' in (strip as object)) return;
  let held = false;
  const arm = (): void => { clearTimeout(rest); rest = held ? undefined : setTimeout(() => { if (!held) settle(); }, RAIL_SETTLE_MS); };
  const hold = (): void => { held = true; clearTimeout(rest); rest = undefined; };
  const release = (): void => { if (!held) return; held = false; arm(); };
  strip.addEventListener('scroll', arm, { passive: true });
  for (const t of ['pointerdown', 'touchstart']) strip.addEventListener(t, hold, { passive: true });
  const retire = (): void => { held = false; clearTimeout(rest); rest = undefined; undrive(strip); };
  const doc = strip.ownerDocument;
  const handles = { release, retire };
  railHandles.set(strip, handles);
  retireRail(doc);                                                               // the strip before it, if any
  railRelease.set(doc, handles);                                                 // this strip is now the one a release acts on
  if (railReleaseWired.has(doc)) return;
  railReleaseWired.add(doc);
  const onRelease = (): void => { railRelease.get(doc)?.release(); };
  for (const t of ['pointerup', 'pointercancel', 'touchend', 'touchcancel']) doc.addEventListener(t, onRelease, { passive: true });
}
export function keepRailCentred(doc: Document): void {
  const strip = doc.querySelector<HTMLElement>('#stage .cx-home.is-page .cx-crossbar__strip[data-rail="scroll"]');
  const cat = strip?.querySelector<HTMLElement>('.cx-cat.is-current') ?? null;
  if (!strip || !cat) { railSeen.delete(doc); if (!strip) retireRail(doc); return; }   // LR-45's fold: Home off the stage
  watchRailRest(strip);
  const view = doc.defaultView;
  const now = { cat: cat.dataset['i'] ?? '', size: `${doc.documentElement.style.fontSize}|${view?.innerWidth ?? 0}x${view?.innerHeight ?? 0}` };
  const last = railSeen.get(doc);
  railSeen.set(doc, now);
  if (last && last.cat === now.cat && last.size === now.size) return;
  const left = centreLeft(strip, cat);
  const reduced = view?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  const behavior: ScrollBehavior = last && last.size === now.size && !reduced ? 'smooth' : 'instant';
  if (Math.abs(left - strip.scrollLeft) > 1) drive(strip, left);           // its rests are the centring's until it lands
  if (typeof strip.scrollTo === 'function') strip.scrollTo({ left, behavior });
  else strip.scrollLeft = left;
}

/**
 * `bump` (LR-1, LR.R3): a press past an end of the rail or of the list, drawn by the page's sheet as the artifact's bump
 * (`./frame` `edgeBump`); absent, none.
 */
export function homeHtml(s: ConsoleState, a: Adapters, narrow = false, bump: { rail: string | null; list: string | null } = { rail: null, list: null }): string {
  const cat = CATS[s.cat]!;
  const items = homeItems(cat.id, s, a);
  const focused = s.item[s.cat] ?? 0;
  // LP.R13/R15: the active slot always sits on the rail's fixed midpoint. The half pitch centers its icon;
  // every category remains accessible, neighboring icons slide through the masked edges, and no native scroll moves it.
  const slide = `calc(var(--s2u-cx-cat-pitch) * ${-s.cat - 0.5})`;
  // LR-23 (LR.R22, the owner, 2026-10-27: the L1/R1 row and the items below it "adopted wholesale", "The entire right side
  // overlay for the selected category - gone"): the launcher page's Home (`is-page`) is the mockup's -- the rail and the
  // list where and as it draws them (../console.css), no readout beside the list for any category, LR-21's sheet gone with
  // Play's panel; the list moves up by the rows above the one before the focused one (the mockup's `itemShift`,
  // `--cx-list-shift`). A browser adaptation.
  // LR-24 (LR.R23 (a), the dispatcher's reading of LR.R22): the page's rail draws no L1 / R1 chips (the mockup draws none;
  // every category is its own click target; the pad's L1 / R1 still step it) and its strip neither clips nor fades
  // (../console.css).
  // LR-39 (LR.R32, the owner, 2026-10-31: "the guide button should be the same as the launcher just with the agreed
  // resume"; supersedes LR.R18 and LR.R23 (a) / (c)'s overlay clauses): over a game the overlay's Home is this one --
  // `is-page` in both modes (the class names the landing page's Home, which the overlay now draws: its sheet's rules
  // apply in the overlay's frame unchanged), no chips, no readout -- its Play row Resume game (`../state` `homeItems`).
  // LR-38 (the owner, 2026-10-29: "no need to show scrollbar when the right icons go out of view", "make the L1R1 scrollable
  // with tap in a graceful apple-like way"): at the phone rule the page's rail is a native sideways scroller (its bar hidden,
  // the finger's momentum and snap, `../console.css` LR-38), so its track is not translated; the current category is
  // brought to its centre by `keepRailCentred` after the draw. A browser adaptation.
  const scroller = narrow;
  // LR-29 (matrix-8's follow-up; a browser adaptation): above the phone rule the Discord row is hidden and the header icon is
  // that stop (LATER 291, `./header` `discordPad`), so the list is held where it stood at the row before it -- it neither
  // slides up to a row nobody sees (hiding Play and Memory card) nor lights Server status: the icon carries the pad's ring.
  const view = !narrow && items[focused]?.act === 'discord' ? Math.max(0, focused - 1) : focused;
  const shift = ` style="--cx-list-shift: ${Math.max(0, view - 1)}"`;
  // LR-36 (LR.R30): Play's launch check, open, over the page's Home (`is-check`: the rail and the list fade under it);
  // never in the overlay, which has no Play and no START (`../grammar` `openCheck`, `start`).
  const check = s.mode !== 'overlay' && s.chk.open && cat.id === 'home';
  // CX-LEGEND (issue #238): above the phone rule the list is its own scroll box, bounded by the stage (shared/ds
  // components.css part J), so a lower action scrolls clear of the legend, which took its clicks at 1280x720. Marked
  // `data-scroll` as CX-11's lists are, so the pad's focused action is kept in view by the list's scrollTop alone
  // (`./frame` keepInView); one box per category (`data-key`), so another category opens at its top.
  return `<section class="cx-home is-page${check ? ' is-check' : ''}" aria-label="Home" data-key="home">
    <h1 class="sr-only">Home</h1>
    <nav class="cx-crossbar" aria-label="Categories"${bump.rail ? ` data-bump="${bump.rail}"` : ''}>
      <div class="cx-crossbar__strip"${scroller ? ' data-rail="scroll"' : ''}>
        <div class="cx-crossbar__track"${scroller ? '' : ` style="transform: translateX(${slide})"`}>
          ${CATS.map((c, i) => `<button type="button" class="cx-cat ${i === s.cat ? 'is-current' : ''}" data-act="cat" data-i="${i}" aria-label="${esc(c.label)}" title="${esc(c.label)}" ${i === s.cat ? 'aria-current="true"' : ''}>${ico(c.icon)}<span class="cx-cat__label">${esc(c.label)}</span></button>`).join('')}
        </div>
      </div>
    </nav>
    <div class="cx-home__body">
      <ul class="cx-list" role="list" aria-label="${cat.label}" data-scroll data-key="list-${cat.id}"${shift}${bump.list ? ` data-bump="${bump.list}"` : ''}>
        ${items.map((x, i) => itemHtml(s, a, x, i, focused, narrow, view)).join('')}
      </ul>
    </div>
    ${check ? launchCheckHtml(s, a) : ''}
  </section>`;
}
