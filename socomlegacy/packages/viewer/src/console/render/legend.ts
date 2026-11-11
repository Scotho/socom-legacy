import { btn, dpad, esc, ico, shoulders, type FaceButton } from '../icons';
import { closesOnly, extractButtons } from './extract';
import { REMAP_STANCE_ROW, remapBindOfRow, remapDeadRow, remapExtraAt } from './remap';
import { fieldMeta, personaItems } from './profile';
import { customItems, lobbyRoomItems } from './lobbies';
import { overlayDiscLine, sourceMenuHtml } from './home';
import { senderButtons, shareCrossWord } from './discShare';
import { SEND_BACK, SEND_CLOSE, SEND_COPY_LINK, SEND_NO, SEND_ROW_VERB, SEND_STOP, SEND_YES, SHARE_ROW_VERB } from '../../discShareWords';
import { COPY_LAUNCHER_ADDRESS, installCopyOffered } from '../../pwa/install';
import {
  CATS, DISC_SOURCES, MODS_DROP_ROW, MODS_FIRST_PACK_ROW, MODS_TEXTURE_ROW, modsTestHdRow, PLAY_LABEL, PLAY_NEED_WORDS, RESUME_LABEL, canChangeRow, canResetRow, deployChecks, isToggleRow, optRowsNow, LOADOUT_SAVE_ROW, PERSONA_DELETE_ROW, PERSONA_GENDER_ROW, PERSONA_NEW_CREATE_ROW, PERSONA_NEW_GENDER_ROW, cardNames, discSource, homeItems, inert, loadoutRows, loadoutSideItems, optCategories, overGame, playNeed, replayRows, replayStatus, roomFull, roundRunning, selectedRoom, serverItems, startLabel,
  startReady, visibleRooms, browseRows, BROWSE_CUSTOM, type Adapters, type Button, type ConsoleState, type LoadoutLocked,
  DEPLOY_NEED_WORDS, LAUNCH_DEPLOY_ROW, LAUNCH_DISC_ROW, LAUNCH_PAD_ROW, LAUNCH_PADSET_ROW, LAUNCH_SEND_ROW, LAUNCH_SHARE_ROW, LAUNCH_SKIP_ROW,
  sendAt, sendInMenu, sendState, sendTargets, SEND_MENU_ROW,
} from '../state';

/**
 * The ConsoleLegend (the S2U Briefing design system's prototype, `prompts()` / `renderLegend`; its ConsoleLegend
 * README): the prompts for what is focused -- confirm, back, the screen's own, the shoulders -- then the disc chip and
 * START, which never moves; the blocked-START warn line above it. A browser adaptation with no original (OT.R28).
 */

/** One legend prompt: its glyph (`cross` ... `triangle`, `dpad-h`, `dpad-v`, or shoulder words), its verb, its press. */
export interface Prompt { k: string; label: string; act: Button | null }

/**
 * `paged` (CX-12): the screen's list is taller than its pane, so L2 / R2 page it (`../grammar` `pageList`, `./frame`
 * `pageRows`): "Page" on L2 R2 after the screen's own prompts, its click R2's (a page down), as Filter's is.
 */
export function prompts(s: ConsoleState, a: Adapters, paged = false): Prompt[] {
  const out: Prompt[] = [];
  const all = prompted(s, a, out);
  if (paged && all) out.push({ k: 'L2 R2', label: 'Page', act: 'r2' });
  return out;
}

/** The context's prompts into `out`; answers false where nothing may follow them (a dialog, a listen). */
function prompted(s: ConsoleState, a: Adapters, out: Prompt[]): boolean {
  const add = (k: string, label: string, act: Button | null) => { out.push({ k, label, act }); };
  const signedIn = a.session.signedIn();
  if (s.overlay === 'signin') {
    add('cross', s.si.zone === 'personas' ? 'Choose' : 'Type', 'cross');
    add('circle', 'Close', 'circle');
    add('square', 'Delete', 'square');
    add('triangle', 'Space', 'triangle');
    add('L2', s.si.shift ? 'Shift on' : 'Shift', 'l2');
    if (a.session.remembers?.() ?? false) add('L1', 'Remember me', 'l1');   // PERSONA-PERSIST (a) (OT.R61 (b))
    const nameNext = s.si.persona >= cardNames(a).length && a.data !== 'sample' && s.si.target === 'name';
    add('R2', nameNext ? 'Next' : 'Sign in', 'r2');
    return false;
  }
  if (s.overlay === 'news') { add('dpad-v', 'Scroll', null); add('circle', 'Close', 'circle'); return false; }
  if (s.overlay === 'search') {
    add('cross', 'Type', 'cross');
    add('circle', 'Close', 'circle');
    add('square', 'Delete', 'square');
    add('triangle', 'Space', 'triangle');
    add('L2', s.q.shift ? 'Shift on' : 'Shift', 'l2');
    add('R2', 'Search', 'r2');
    return false;
  }
  if (s.overlay === 'field') {
    // CX-PERSONA: the Profile's field, the Search dialog's keys; R2 the Done key's word (Save, or Done on the new persona's).
    add('cross', 'Type', 'cross');
    add('circle', 'Cancel', 'circle');
    add('square', 'Delete', 'square');
    add('triangle', 'Space', 'triangle');
    add('L2', s.fd.shift ? 'Shift on' : 'Shift', 'l2');
    add('R2', fieldMeta(s, a).done === 'SAVE' ? 'Save' : 'Done', 'r2');
    return false;
  }
  if (s.overlay === 'agreement') { add('cross', 'Choose', 'cross'); add('dpad-v', 'Scroll', null); add('circle', 'Decline', 'circle'); return false; }
  if (s.overlay === 'extract') {
    // DX-3: the extraction's popover (`./extract` `extractPress`): Circle cancels while it runs (Stop the check for a
    // check); on a refusal Cross presses the focused button (Try again, Resume, Check again, or Continue from the disc),
    // the D-pad moves between them; Circle closes until three extraction failures permit disc fallback. Done: none.
    const v = s.extract;
    if (!v || v.phase === 'done') return false;
    if (v.phase !== 'error') { add('circle', v.phase === 'verify' ? 'Stop the check' : 'Cancel', 'circle'); return false; }
    const w = extractButtons(v);
    if (closesOnly(v)) { add('circle', w.on, 'circle'); return false; }
    add('cross', v.row === 0 ? w.retry : w.on, 'cross');
    add('dpad-v', 'Choose', null);
    add('circle', w.on, 'circle');
    return false;
  }
  if (s.overlay === 'states') { add('cross', 'Toggle', 'cross'); add('circle', 'Close', 'circle'); return false; }
  if (s.overlay === 'confirm') { add('cross', 'Choose', 'cross'); add('circle', 'Cancel', 'circle'); return false; }
  if (s.overlay === 'install') {
    // RB-45 (b): Cross is Copy launcher address where the dialog offers it (`../grammar`); elsewhere Cross does not
    // install (a pad press is not a user activation) and no prompt names it.
    if (installCopyOffered(a.options.installSurface?.() ?? 'other')) add('cross', COPY_LAUNCHER_ADDRESS, 'cross');
    add('dpad-v', 'Scroll', null);
    add('circle', 'Close', 'circle');
    return false;
  }
  if (s.overlay === 'share') {
    // DSH-5 (DSH.R12): the sender's dialog -- Cross the focused button, Circle the last (No, Stop or Close).
    const v = a.discShare?.sender();
    if (!v) return false;
    const b = senderButtons(v);
    if (b.length > 1) { add('cross', b[Math.max(0, Math.min(b.length - 1, s.snd.row))]!.words, 'cross'); add('dpad-h', 'Choose', null); }
    add('circle', b[b.length - 1]!.words, 'circle');
    return false;
  }   // PWA-6: Cross is not the install (a pad press is not a user activation)
  if (s.overlay === 'viewer') {
    // CX-15: the replay viewer over the page -- what Cross presses there by the control's own name (the viewer's words),
    // or on the seek bar the D-pad's jump; Circle is Close.
    const f = a.replays.watching?.()?.focused();
    if (f?.kind === 'control') add('cross', f.label, 'cross');
    else if (f?.kind === 'seek') add('dpad-h', f.label, null);
    add('circle', 'Close', 'circle');
    return false;
  }
  if (s.screen === 'home') {
    const cat = CATS[s.cat]!;
    const it = homeItems(cat.id, s, a)[s.item[s.cat] ?? 0];
    // CX-16: the disc source dropdown open (the confirm's words) -- over the overlay's Disc action, or (LR-23) beside the
    // launcher page's disc chip.
    if (s.src.open) {
      // DSH-11: on SEND DISC, Cross is Send where it can (a disabled one's press says why, unprompted).
      const send = s.src.row === SEND_MENU_ROW && sendInMenu(s, a);
      if (!send) add('cross', 'Choose', 'cross');
      else if (sendState(a).ok) add('cross', SEND_ROW_VERB, 'cross');
      add('circle', 'Close', 'circle');
      return false;
    }
    if (s.thm.open) { add('cross', 'Choose', 'cross'); add('circle', 'Close', 'circle'); return false; }   // LR-13: the theme drop-up
    // LR-36 (LR.R30): Play's "Before you deploy" panel -- Cross named by the focused row (the disc's verb, Check, Deploy or
    // what Deploy still needs, Open), Circle Back; the panel holds the pad, so nothing else is offered.
    if (s.chk.open && s.chk.send) {
      // DSH-10 (DSH.R17; RB-27's map): the send area -- Cross by its focus (Copy link on the link, Yes on a request asked),
      // Square No on a request, Triangle Stop while a copy runs, Up / Down between them, Circle closes it (the share ends).
      const v = a.discShare?.host?.();
      if (v) {
        const at = sendAt(s, v);
        const req = at?.startsWith('req:') ? v.pending.find((r) => `req:${r.id}` === at) : undefined;
        if (at === 'link') add('cross', SEND_COPY_LINK, 'cross');
        else if (req?.state === 'asked') add('cross', SEND_YES, 'cross');
        if (req) add('square', SEND_NO, 'square');
        if (v.active) add('triangle', SEND_STOP, 'triangle');
        if (sendTargets(v).length > 1) add('dpad-v', 'Choose', null);
      }
      // The review's F2: Stop sharing only while there is a share (its link made or being made); else Back.
      add('circle', v?.phase === 'open' || v?.phase === 'opening' ? SEND_CLOSE : SEND_BACK, 'circle');
      return false;
    }
    if (s.chk.open && s.chk.share) {
      // DSH-5 (DSH.R12): the share's area -- Cross its Try again after a failure (RB-26: Ask again after a host's No),
      // Circle Back to the rows.
      const cross = a.discShare ? shareCrossWord(a.discShare.receiver()) : null;
      if (cross !== null) add('cross', cross, 'cross');
      add('circle', 'Back', 'circle');
      return false;
    }
    if (s.chk.open) {
      const need = playNeed(s, a);
      const row = s.chk.row;
      const cross = row === LAUNCH_DISC_ROW ? deployChecks(s, a)[0]?.verb ?? 'Choose disc'
        : row === LAUNCH_PAD_ROW ? 'Check'
          : row === LAUNCH_DEPLOY_ROW ? (need ? DEPLOY_NEED_WORDS[need] : 'Deploy')
            : row === LAUNCH_SKIP_ROW ? 'Toggle'   // SKIP-MENU (LR.R33): a toggle row's word (LR-13)
            : row === LAUNCH_PADSET_ROW ? 'Open'
              // DSH-10: Send only where it can (a disabled row's Cross says why on the error line, unprompted).
              : row === LAUNCH_SEND_ROW && a.discShare ? (sendState(a).ok ? SEND_ROW_VERB : '')
                : row === LAUNCH_SHARE_ROW && a.discShare ? SHARE_ROW_VERB : '';   // DSH-5 (DSH.R12)
      if (cross) add('cross', cross, 'cross');
      // Setup onboarding (ZjCZXTTW): the Disc row's two sources, switched by Left / Right where the source can be.
      if (row === LAUNCH_DISC_ROW && deployChecks(s, a)[0]?.source) add('dpad-h', 'Disc source', null);
      add('circle', 'Back', 'circle');
      return false;
    }
    // LR-23 (LR.R22): Play's Cross is the launch when it is ready, else the check it opens -- named so ("Play: disc needed").
    const need = it?.act === 'play' ? playNeed(s, a) : null;
    // OVERLAY-CONSOLE: a "Coming" or a locked item's Cross does nothing, so no prompt names it.
    // The launch target picked in Browse rooms is named on it as START's pill named it ("Launch · Channel 1").
    const target = it?.act === 'play' && !need ? selectedRoom(s, a) : null;
    // LR-39 (LR.R32): the overlay's Resume game names itself on Cross, as Play does.
    if (it && !inert(it)) add('cross', it.act === 'play' ? (need ? PLAY_NEED_WORDS[need] : target ? `Launch · ${target.name}` : PLAY_LABEL) : it.act === 'resume' ? RESUME_LABEL : 'Select', 'cross');
    // OVERLAY-CONSOLE: in the overlay, Circle at the top goes back to the game.
    if (s.mode === 'overlay') add('circle', 'Back to game', 'circle');
    add('L1 R1', 'Menu', 'r1');
    if (!(it && it.verb === 'Sign in' && !signedIn)) add('triangle', signedIn ? 'Account' : 'Sign in', 'triangle');
    if (cat.id === 'replays') add('square', 'Refresh', 'square');
    else if (it?.source) add('square', 'Disc source', 'square');           // CX-16: the source's dropdown, the screen's own press
    else if (it?.act === 'play' && deployChecks(s, a)[0]?.source) add('square', 'Disc source', 'square');   // LR-23: the chip's cog
  } else if (s.screen === 'rooms') {
    const r = visibleRooms(s, a)[s.rooms.row];
    const c = browseRows(s, a)[s.rooms.row];
    // LR2 review F1: a custom match's row in the merged list keeps the old Custom matches screen's Cross -- Join, and over a
    // game page none (JOIN is locked there, its line on the row's drawer and, at the press, the warn line).
    if (c?.kind === 'custom') { if (!overGame(s)) add('cross', 'Join', 'cross'); }
    // OVERLAY-CONSOLE: the rooms are read only in the overlay (no launch target), so no Cross there -- but CX-LOBBIES' rows
    // of the live lobby, a briefing room or a game, which open their detail for reading there too.
    else if (r?.kind && signedIn) add('cross', 'Open', 'cross');
    else if (r && s.mode !== 'overlay') add('cross', !signedIn ? 'Sign in' : roomFull(r) ? 'Room full' : s.rooms.selected === r.id ? 'Clear target' : 'Pick room', 'cross');
    add('circle', 'Back', 'circle');
    // LR2 review F2: Square reads again what the filter shows -- CLASSIC the rooms, CUSTOM the custom matches, ALL both;
    // offered under CUSTOM where there is a custom matches adapter, else where the rooms can be read again (a lost session
    // offers none, the CX-LOBBIES review's F2).
    if (s.rooms.kind === BROWSE_CUSTOM ? !!a.custom : refreshes(a)) add('square', 'Refresh', 'square');
    if (a.rooms.search) add('triangle', 'Search', 'triangle');
    add('L2 R2', 'Filter', 'r2');
    // LR2 review F1: Left / Right step the left column's ALL / CLASSIC / CUSTOM, named as the column is ("Show"), the D-pad's
    // left / right glyph as the legend's other steppers draw it.
    add('dpad-h', 'Show', null);
    if (clears(s, a)) add('L1', 'Clear target', 'l1');
  } else if (s.screen === 'replays') {
    if (replayRows(a).length) add('cross', roundRunning(s) ? 'After the round' : a.disc.state() === 'ready' ? 'Watch' : 'Needs disc', 'cross');
    else { const status = replayStatus(a); if (status) add('cross', status.verb, 'cross'); }
    add('circle', 'Back', 'circle');
    add('square', 'Refresh', 'square');
  } else if (s.screen === 'server') {
    // CX-28: the Server screen. Cross is the focused row's verb; Square refreshes; Circle goes back to Play online.
    const it = serverItems(a)[s.sv.row];
    if (it) add('cross', it.verb, 'cross');
    add('circle', 'Back', 'circle');
    add('square', 'Refresh', 'square');
  } else if (s.screen === 'mods') {
    // B206 ML-2: the MODS screen. The focused row says what Cross does; a pack's Square removes it.
    const v = a.mods?.view();
    const row = v?.rows[s.md.row - MODS_FIRST_PACK_ROW];
    if (s.md.row === MODS_DROP_ROW && a.mods) add('cross', 'Choose a file', 'cross');
    else if (s.md.row === MODS_TEXTURE_ROW && a.mods) add('dpad-h', 'Texture pack', null);
    else if (s.md.row === modsTestHdRow(v) && a.mods) add('cross', 'Add', 'cross');   // TEST_HD_PACK_BUTTON_ADAPTATION (ML-12)
    else if (row && row.on !== null) add('cross', row.on ? 'Switch off' : 'Switch on', 'cross');
    if (row) add('square', 'Remove', 'square');
    if (row?.up || row?.down) add('dpad-h', 'Order', null);
    add('circle', 'Back', 'circle');
  } else if (s.screen === 'options') {
    if (s.opt.zone === 'cats') { add('cross', 'Open', 'cross'); add('circle', 'Back', 'circle'); }
    else {
      const row = optRowsNow(s, a)[s.opt.row];
      // LR-20 (the LR.R11 side-by-side's P4): Cross is named by what it does on the row's kind -- a link (Appearance's
      // "Theme & background", whose action word is its value) opens; an action or a pick its verb; a toggle Toggle --
      // and the D-pad's Change only on a row with values; an info row (App's Version) offers neither.
      if (row?.link && row.action) add('cross', 'Open', 'cross');
      else if (row?.action) add('cross', row.action, 'cross');
      else if (canChangeRow(row, signedIn)) {                                // LR-22 (R8): a locked or read-only row offers nothing
        if (isToggleRow(row)) add('cross', 'Toggle', 'cross');                 // LR-13 (LR.R16 (6)): Cross flips it
        add('dpad-h', 'Change', null);
      }
      add('circle', 'Back', 'circle');
      // LR-20 (pass 2's Q13; 03_SETTINGS_CATALOG: Reset "unavailable where there is none"): Square only where the row
      // has a default to go back to, and can change now -- the grammar's own test for its Square (`canResetRow`).
      if (canResetRow(row, signedIn)) add('square', 'Reset to default', 'square');
      if (!s.opt.panel) add('L1 R1', 'Category', 'r1');                  // LR-13: a pushed panel has no tabs
    }
  } else if (s.screen === 'loadoutSides') {
    add('cross', loadoutSideItems(a)[s.lo.row]?.verb ?? 'Open', 'cross');
    add('circle', 'Back', 'circle');
  } else if (s.screen === 'loadouts') {
    // CX-LOADOUTS: the list -- Open a mission (a record not offered opens nothing), Try again a refusal, a lock's way out.
    const v = a.loadouts?.list();
    const r = loadoutRows(a)[s.lo.row];
    const verb = v?.kind === 'locked' ? lockVerb(s, v) : v?.kind === 'failed' ? 'Try again' : r && r.state !== 'unoffered' ? 'Open' : null;
    if (verb) add('cross', verb, 'cross');
    add('circle', 'Back', 'circle');
  } else if (s.screen === 'loadout') {
    // CX-LOADOUTS: the editor -- Change on a roller, Save on its row; Square saves from a slot, Triangle the defaults.
    const v = a.loadouts?.editor();
    if (v?.kind === 'ok') {
      if (s.lo.edit === LOADOUT_SAVE_ROW) add('cross', v.busy ? 'Saving…' : 'Save', 'cross'); else add('dpad-h', 'Change', null);
      add('circle', 'Back', 'circle');
      if (s.lo.edit >= 1 && s.lo.edit < LOADOUT_SAVE_ROW) add('square', 'Save', 'square');
      add('triangle', 'Defaults', 'triangle');
    } else {
      const verb = v?.kind === 'locked' ? lockVerb(s, v) : null;
      if (verb) add('cross', verb, 'cross');
      add('circle', 'Back', 'circle');
    }
  } else if (s.screen === 'persona') {
    // CX-PERSONA: a persona's Edit (Open under the lock), New persona or its Try again, the match name's Edit; a note none.
    const it = personaItems(a)[s.pf.row];
    if (it?.verb) add('cross', it.verb, 'cross');
    add('circle', 'Back', 'circle');
  } else if (s.screen === 'personaEdit') {
    // CX-PERSONA: the editor -- Edit a field, Change the gender, Delete; under the lock no Cross (it says the line).
    const v = s.pf.id === null ? null : a.profile?.editor(s.pf.id) ?? null;
    if (v?.kind === 'ok' && v.locked === null) {
      if (s.pf.edit === PERSONA_GENDER_ROW) add('dpad-h', 'Change', null);
      else add('cross', s.pf.edit === PERSONA_DELETE_ROW ? 'Delete' : 'Edit', 'cross');
    }
    add('circle', 'Back', 'circle');
  } else if (s.screen === 'personaNew') {
    if (s.pf.nw.row === PERSONA_NEW_GENDER_ROW) add('dpad-h', 'Change', null);
    else add('cross', s.pf.nw.row === PERSONA_NEW_CREATE_ROW ? 'Create' : 'Type', 'cross');
    add('circle', 'Cancel', 'circle');
  } else if (s.screen === 'record') {
    // CX-PERSONA: read only -- Cross only for a refusal's Try again or, signed out, Sign in; Square reads it again.
    const v = a.profile?.record();
    if (v?.kind === 'signed-out') add('cross', 'Sign in', 'cross');
    else if (v?.kind === 'signed-in' && v.record.kind === 'failed') add('cross', 'Try again', 'cross');
    add('circle', 'Back', 'circle');
    if (v?.kind === 'signed-in') add('square', 'Refresh', 'square');
  } else if (s.screen === 'room') {
    // CX-LOBBIES: Open on a game of the room; its players are read only. Square reads the list again.
    if (lobbyRoomItems(a, s.lb.room)[s.lb.row]?.kind === 'game') add('cross', 'Open', 'cross');
    add('circle', 'Back', 'circle');
    if (refreshes(a)) add('square', 'Refresh', 'square');
    if (clears(s, a)) add('L1', 'Clear target', 'l1');
  } else if (s.screen === 'game') {
    add('circle', 'Back', 'circle');
    if (refreshes(a)) add('square', 'Refresh', 'square');
    if (clears(s, a)) add('L1', 'Clear target', 'l1');
  } else if (s.screen === 'custom') {
    // CX-LOBBIES: Join on a listed lobby; over a game page JOIN is locked (its line on Cross), so no prompt names it.
    if (customItems(s, a)[s.lb.crow]?.kind === 'match' && !overGame(s)) add('cross', 'Join', 'cross');
    add('circle', 'Back', 'circle');
    add('square', 'Refresh', 'square');
  } else if (s.screen === 'remap') {
    // CX-14: while a binding is listened for, every pad button is the binding's but L1 + R1 together, which cancel (the
    // prompt's click is Circle's, which cancels too); otherwise the row's change, Back, the tuner's reset, Restore defaults.
    // LATER 380: the teach pass -- the raw pad holds and taps its own way; the one prompt is Circle's Skip on a step that
    // may be skipped (the taught Circle's tap does it on the pad; #491's review, 3), Not now the panel's own button.
    // Before it, Start and Back.
    const rm = a.remap?.current() ?? null;
    const teach = rm?.teachState() ?? null;
    if (teach) { if (!teach.required) add('circle', 'Skip', 'circle'); return false; }
    if (rm?.raw && rm.teachable() && !rm.usable()) { add('cross', 'Start', 'cross'); add('circle', 'Back', 'circle'); return true; }
    if ((rm?.listening() ?? -1) >= 0) { add('L1 R1', 'Cancel', 'circle'); return false; }
    // PP-5: the dead zone and the Stance mode are tuners; Crouch and Prone listen as an action's row, Square unbinds
    // (STM.R1: SEPARATE's rows only).
    const tuner = s.rm.row === remapDeadRow() || s.rm.row === REMAP_STANCE_ROW;
    const bind = remapBindOfRow(s.rm.row) !== undefined;
    const extra = remapExtraAt(rm, s.rm.row);                     // OBF-10b's review: an extra row's Cross is its act
    // h59U9CLb: Extra binds shows or hides its rows (Square clears them); an Add row chooses its action and binds; a kept
    // extra's Cross removes it.
    const adds = extra === 'addDouble' || extra === 'addCombo';
    if (tuner) add('dpad-h', 'Change', null);
    else if (adds) { add('dpad-h', 'Action', null); add('cross', 'Bind', 'cross'); }
    else add('cross', extra === 'teach' ? 'Teach again' : extra === 'finish' ? 'Finish' : extra === 'extras' ? (rm?.extrasOpen ? 'Hide' : 'Show') : extra?.startsWith('bind:') ? 'Remove' : 'Change', 'cross');
    add('circle', 'Back', 'circle');
    if (tuner) add('square', 'Reset to default', 'square');
    else if (bind) add('square', 'Unbind', 'square');
    else if (extra === 'extras' && rm && rm.extraList().length > 0) add('square', 'Clear', 'square');
    add('triangle', 'Restore defaults', 'triangle');
  }
  return true;
}

/**
 * CX-LOADOUTS: what Cross does on a locked loadouts screen -- signed out, Sign in; the disc out, Choose disc (none over a
 * game page, where the disc is the game's); a round running, nothing (its line is said again).
 */
function lockVerb(s: ConsoleState, v: LoadoutLocked): string | null {
  if (v.lock === 'sign-in') return 'Sign in';
  if (v.lock === 'disc') return overGame(s) ? null : 'Choose disc';
  return null;
}

/**
 * CX-LOBBIES: Clear target -- L1 on Browse rooms and a room's and a game's screen (the one press free on all three:
 * Triangle is Browse rooms' Search), shown only while a launch target is set; never in the overlay, which sets none.
 * The sample rows (no lobby detail) keep their Cross "Clear target".
 */
const clears = (s: ConsoleState, a: Adapters): boolean => a.rooms.room !== undefined && selectedRoom(s, a) !== null;

/** CX-LOBBIES review F2: Refresh offered on the lobby's screens unless a lost session's state holds (the section hid its Retry). */
const refreshes = (a: Adapters): boolean => a.rooms.refreshable?.() ?? true;

const FACE: readonly string[] = ['cross', 'circle', 'square', 'triangle'];

/**
 * OVERLAY-CONSOLE (MU2.R3; the seat's frames' F-A): the overlay's label as a browser adaptation, one short line of the
 * legend -- where the launcher has its disc chip and START, which the overlay has not -- drawn in every state the overlay
 * shows (Home, a pushed screen, a dialog). The parity rule's label for an adaptation; the game's running on under it is
 * Home's readout's line.
 */
export const OVERLAY_TAG_WORDS = 'Browser adaptation, not part of the original';

/** Whether the legend's top rule turns gold (START ready, the cluster shown). */
export const legendReady = (s: ConsoleState, a: Adapters): boolean => startReady(s, a) && s.overlay !== 'signin' && s.overlay !== 'search' && s.overlay !== 'viewer' && s.overlay !== 'extract' && s.overlay !== 'field';

/** The legend's prompts, drawn (`prompts`). */
function promptsHtml(s: ConsoleState, a: Adapters, paged: boolean): string {
  return prompts(s, a, paged).map((p) => {
    const glyph = FACE.includes(p.k) ? btn(p.k as FaceButton) : p.k === 'dpad-h' ? dpad('h') : p.k === 'dpad-v' ? dpad('v') : shoulders(p.k);
    return `<li>${p.act ? `<button type="button" class="cx-prompt" data-act="press" data-b="${p.act}">` : '<span class="cx-prompt">'}${glyph}<span class="cx-label">${esc(p.label)}</span>${p.act ? '</button>' : '</span>'}</li>`;
  }).join('');
}

/** `paged` (CX-12): the screen's list overflows its pane, so the prompts end with L2 R2 "Page" (`prompts`). */
export function legendHtml(s: ConsoleState, a: Adapters, paged = false): string {
  const ready = startReady(s, a);
  // Under the on-screen keyboard (ConsoleLegend README); and under the replay viewer (CX-15) and the extraction's popover
  // (DX-3), where START is not read.
  // OVERLAY-CONSOLE: in the overlay there is no START and the disc is the game's: no cluster at all -- but on Home, since
  // LR-39 (LR.R32: the overlay's Home is the page's), the page's three marks, the disc's read only (below).
  const bare = s.overlay !== 'signin' && s.overlay !== 'search' && s.overlay !== 'viewer' && s.overlay !== 'extract' && s.overlay !== 'field';
  const showCluster = s.mode !== 'overlay' && bare;
  const disc = a.disc.state();
  const pad = a.pad.connected();
  const mic = a.mic.on() && !a.mic.refused?.();
  const discTone = disc === 'ready' ? 'ready' : disc === 'reading' ? 'warning' : 'danger';
  const device = (kind: 'pad' | 'mic', on: boolean, label: string): string => `<span class="cx-device cx-status--${on ? 'ready' : kind === 'pad' ? 'danger' : 'warning'}" data-device="${kind}" role="img" aria-label="${esc(label)}" title="${esc(label)}">${ico(kind === 'mic' && !on ? 'micOff' : kind)}<span class="cx-device__label">${esc(label)}</span></span>`;
  // `error` is slice 2's (the setup page's badge word "Check disc", `../../startup` `sync`); the prototype has three states.
  const discWord = disc === 'ready' ? 'Disc ready' : disc === 'reading' ? 'Reading disc' : disc === 'error' ? 'Check disc' : 'Choose disc';
  // CX-16: what the chip opens is the active source's chooser, and its line says which (the design's words for the image).
  const folder = discSource(a) === 'folder';
  const discSub = disc === 'ready' ? 'Change disc' : disc === 'reading' ? 'One moment…' : disc === 'error' ? (folder ? 'Choose another folder' : 'Choose another .iso') : folder ? 'Your disc folder' : 'Your own .iso';
  // LR-23 (LR.R22: the readiness is the bottom row's): on the launcher page's Home START's pill is gone ("Start game,
  // gone": Play's Cross and the pad's START launch), the disc step's line -- the kept disc, the image or folder named, the
  // reader's refusal, an invite waiting (`../state` `discItem`), once its Home row and Play's panel -- rides on the
  // bottom row's disc mark for a reader (visually hidden) and the pointer (its title) -- LR-23's chip and its cog, LR-24's
  // mark, below. The other screens keep START, the chip and the device marks (Browse rooms names its target on START).
  // LR-39 (LR.R32): the overlay's Home draws the page's marks too; over a game the disc mark says the disc in use as the
  // overlay reads it (`./home` `overlayDiscLine`, MU2.R6: its `data-disc-line` and line, once LR.R18's readout's) and
  // chooses nothing (the Disc step is locked there, `../state` `homeItems`' passes: its press says the lock's line).
  const onHome = s.screen === 'home';
  // LR-46 (the owner, 2026-10-31: "Make the settings overlay use the same bottom left icons as the home page"): Settings
  // draws Home's three marks too, on the page and in the overlay, where it drew the device cues and the disc chip; its
  // prompts stay, and on the page START after them. Its disc mark has no Disc step's line (that is Home's) and no source
  // menu: it is the chooser, the chip's act (`../grammar` `discmark`); over a game it says the disc in use, as Home's.
  const marked = (onHome || s.screen === 'options') && bare;
  const over = marked && s.mode === 'overlay' ? overlayDiscLine(s, a) : null;
  const step = onHome ? deployChecks(s, a)[0] : undefined;
  const line = over ? over.text : step?.sub ?? '';
  const overWord = over ? (step?.state?.[0] || discWord) : discWord;
  const tip = over ? `${overWord}: ${line}` : `${discWord}: ${discSub}${line ? ` · ${line}` : ''}`;
  // LR-24 (LR.R23 (b), the dispatcher's reading of LR.R22 -- "The bottom row? the new mockup UI"; the owner may overturn):
  // on the page's Home the row is the mockup's (`S2 Launcher v2.dc.html` lines 176-185, its `status` at 1058-1067): DISC,
  // CONTROLLER, MIC as three round marks, each with its status dot (`data-tone`: ok, warn, off, the mockup's `mk` tones;
  // the microphone refused is warn, ours). No word is drawn: the disc's word and the Disc step's line ride in the mark's
  // aria-label and title and a visually hidden span. The disc mark is the disc's one control: it opens CX-16's source
  // menu (upward, `../console.css`), and an option there is the source and its chooser (`../grammar` `pickSource`); with
  // no source to switch it is the chooser. The controller and microphone marks say their state, as LR-21's did, and (LR-25, LR.R23 (e)) are buttons as the mockup's
  // are (lines 1066-1068): the controller's opens the controller check, the microphone's jumps to the voice setting.
  const startButton = `<button type="button" class="cx-start ${ready ? 'is-ready' : ''} ${s.start === 'arming' ? 'is-arming' : ''}" data-act="start" aria-disabled="${!ready}">
        <svg class="cx-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4l14 8-14 8z"/></svg><span class="cx-label">${esc(startLabel(s, a))}</span>
      </button>`;
  if (marked) {
    const micTone = mic ? 'ok' : a.mic.refused?.() ? 'warn' : 'off';
    const glyph = (icon: Parameters<typeof ico>[0]): string => `<span class="cx-mark__glyph" aria-hidden="true">${ico(icon)}<span class="cx-mark__dot"></span></span>`;
    // The status class (LR-21's: required equipment missing `danger`, the optional microphone `warning`) stays on each
    // mark for a reader of the DOM; it colours no glyph (the mark's svg is not its direct child), the dot is the colour.
    const status = (on: boolean, kind: 'pad' | 'mic'): string => `cx-status--${on ? 'ready' : kind === 'pad' ? 'danger' : 'warning'}`;
    const mark = (kind: 'pad' | 'mic', tone: string, label: string): string => `<button type="button" class="cx-mark ${status(kind === 'pad' ? pad : mic, kind)}" data-mark="${kind}" data-tone="${tone}" data-act="mark${kind}" aria-label="${esc(label)}" title="${esc(label)}">${glyph(kind)}</button>`;
    const hidden = `<span class="cx-mark__text sr-only"><span class="cx-mark__word">${esc(overWord)}</span>${line ? `<span class="cx-mark__line">${esc(line)}</span>` : ''}</span>`;
    const menu = !!step?.source;
    // The cog's name (CX-16's "Disc source: ...", CX.R5's words) joins the mark's, the mark being the menu's control now.
    const source = DISC_SOURCES.find((o) => o.id === discSource(a))?.label ?? '';
    const markTip = menu ? `${tip} · Disc source: ${source}` : tip;
    // LR-28 (fact 4): the marks' cluster is marked (`cx-cluster--marks`) so a short landscape bar puts it first in its line
    // (../console.css): the prompts a key draws there never move the marks.
    const tone = over ? (over.ok ? 'ok' : 'warn') : disc === 'ready' ? 'ok' : 'warn';
    // LR-46: Settings' cluster carries START after the marks on the page (`cx-cluster--start`; ../console.css places it).
    const start = !onHome && showCluster ? startButton : '';
    const discMark = `<span class="cx-markbox"><button type="button" class="cx-mark is-${disc} cx-status--${over ? (over.ok ? 'ready' : 'warning') : discTone}${menu && s.src.open ? ' is-open' : ''}" data-mark="disc" data-tone="${tone}"${over ? ` data-disc-line="${over.state}"` : ''} data-act="discmark"${menu ? ` aria-haspopup="menu" aria-expanded="${s.src.open}"` : ''} aria-label="${esc(markTip)}" title="${esc(markTip)}">${glyph('disc')}${hidden}</button>${menu ? sourceMenuHtml(s, a) : ''}</span>`;
    return `
    <ul class="cx-prompts" aria-label="Controller prompts">
      ${promptsHtml(s, a, paged)}
    </ul>
    <div class="cx-cluster cx-cluster--marks${start ? ' cx-cluster--start' : ''}"><div class="cx-marks" aria-label="Device status">${discMark}${mark('pad', pad ? 'ok' : 'warn', pad ? 'Controller connected' : 'No controller connected')}${mark('mic', micTone, mic ? 'Microphone on' : 'Microphone off (optional)')}</div>${start}</div>
    ${s.mode === 'overlay' ? `<p class="cx-overlaytag" data-overlay-label>${OVERLAY_TAG_WORDS}</p>` : ''}
    <p class="cx-legend__error" role="status">${esc(s.legendError)}</p>`;
  }
  return `
    <ul class="cx-prompts" aria-label="Controller prompts">
      ${promptsHtml(s, a, paged)}
    </ul>
    ${showCluster ? `<div class="cx-cluster">
      <div class="cx-devices" aria-label="Device status">${device('pad', pad, pad ? 'Controller connected' : 'No controller connected')}${device('mic', mic, mic ? 'Microphone on' : 'Microphone off (optional)')}</div>
      <button type="button" class="cx-chip is-${disc} cx-status--${discTone}" data-act="disc" aria-label="${esc(tip)}" title="${esc(tip)}">${ico('disc')}<span class="cx-chip__text"><span class="cx-chip__word">${discWord}</span><span class="cx-chip__sub">${discSub}</span>${line ? `<span class="cx-chip__line sr-only">${esc(line)}</span>` : ''}</span></button>
      ${startButton}
    </div>` : ''}
    ${s.mode === 'overlay' ? `<p class="cx-overlaytag" data-overlay-label>${OVERLAY_TAG_WORDS}</p>` : ''}
    <p class="cx-legend__error" role="status">${esc(s.legendError)}</p>`;
}

/**
 * LR-27 (a browser adaptation, nothing of the game): the one place Home's disc-source menu is positioned, whichever way it
 * opened (a click on the mark, Square on Play, Enter on the mark). Its left edge is the disc mark's, pulled back so it stays
 * inside the window, and its bottom edge sits a little above the mark (upward, as `../console.css` draws it), measured from
 * the menu's own containing block so no ancestor's layout moves it. Run after each draw (`../app`); nothing with no menu or
 * no layout (a page not yet laid out).
 */
export function anchorSourceMenu(doc: Document): void {
  const menu = doc.querySelector<HTMLElement>('.cx-legend .cx-markbox > .cx-srcmenu');
  const mark = menu?.parentElement?.querySelector<HTMLElement>('[data-mark="disc"]');
  if (!menu || !mark) return;
  const at = mark.getBoundingClientRect();
  if (!at.width && !at.height) return;
  const box = (menu.offsetParent ?? menu.parentElement!).getBoundingClientRect();
  const view = doc.defaultView;
  const width = menu.getBoundingClientRect().width;
  let left = at.left - box.left;
  if (view && width) left = Math.max(-box.left, Math.min(left, view.innerWidth - width - box.left));
  menu.style.left = `${left}px`;
  menu.style.right = 'auto';
  menu.style.top = 'auto';
  menu.style.bottom = `${box.bottom - at.top + 6}px`;
}
