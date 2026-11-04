import { describe, expect, it } from 'vitest';
import { fileDiscMounted, noteDiscSource, resetFileDiscForTest } from '../../src/pwa/fileDisc';
import { UNSAVED_EDIT_MARK, readHoldSignals, reloadHeld } from '../../src/pwa/matchSignals';
import {
  RELEASE_POLL_MS, UPDATE_NOTICE, controllerChangeAction, createUpdateClient, updateNoticeHidden, type RegistrationHandle, type WorkerHandle,
} from '../../src/pwa/update';

/**
 * The disc-verification fixes for the release worker (PWA-4). A browser adaptation.
 * A match in another tab must not reload when this page asks the worker to take over, a first claim must not
 * reload the visit, and a file-picked disc shows a notice instead of reloading.
 */

interface FakeWorker extends WorkerHandle {
  messages: unknown[];
}

function worker(state: string): FakeWorker {
  const messages: unknown[] = [];
  return {
    state,
    messages,
    postMessage(data: unknown) { messages.push(data); },
    addEventListener() { /* the state is moved by the test */ },
  };
}

describe('controllerchange', () => {
  it('a first claim is not a reload, including while a match link is open', () => {
    expect(controllerChangeAction({ firstClaim: true, requestedUpdate: false, inMatch: true, fileDisc: false })).toBe('ignore');
    expect(controllerChangeAction({ firstClaim: true, requestedUpdate: true, inMatch: false, fileDisc: false })).toBe('ignore');
    const reloads: string[] = [];
    const visit = createUpdateClient({
      hadController: false,
      inMatch: () => true,
      fileDisc: () => false,
      reload: () => { reloads.push('reload'); },
      showNotice: () => { reloads.push('notice'); },
    });
    expect(visit.onInstalled(worker('installed'))).toBe('ignored');
    expect(visit.onControllerChange()).toBe('ignore');
    expect(reloads).toEqual([]);
  });

  it('a match in another tab does not reload when this page takes the new worker, and reloads once the match ends', () => {
    let inMatch = true;
    const events: string[] = [];
    const match = createUpdateClient({
      hadController: true,
      inMatch: () => inMatch,
      fileDisc: () => false,
      reload: () => { events.push('match-reload'); },
      showNotice: () => { events.push('match-notice'); },
    });
    const launcher = createUpdateClient({
      hadController: true,
      inMatch: () => false,
      fileDisc: () => false,
      reload: () => { events.push('launcher-reload'); },
      showNotice: () => { events.push('launcher-notice'); },
    });
    const next = worker('installed');
    expect(match.onInstalled(next)).toBe('parked');
    expect(next.messages).toEqual([]);
    expect(launcher.onInstalled(next)).toBe('activated');
    expect(next.messages).toEqual([{ type: 'skip-waiting' }]);
    expect(match.onControllerChange()).toBe('defer');
    expect(launcher.onControllerChange()).toBe('reload');
    expect(events).toEqual(['launcher-reload']);
    expect(match.settle()).toBe(false);
    inMatch = false;
    expect(match.settle()).toBe(true);
    expect(events).toEqual(['launcher-reload', 'match-reload']);
  });

  it('an idle tab that did not ask does not reload on another tab\'s controller change', () => {
    const reloads: string[] = [];
    const idle = createUpdateClient({
      hadController: true,
      inMatch: () => false,
      fileDisc: () => false,
      reload: () => { reloads.push('reload'); },
      showNotice: () => { reloads.push('notice'); },
    });
    expect(idle.onControllerChange()).toBe('ignore');
    expect(reloads).toEqual([]);
  });
});

describe('an installed worker is activated outside a match', () => {
  it('does not reload while the worker is still installing, then asks it to take over once it is installed', () => {
    const events: string[] = [];
    const client = createUpdateClient({
      hadController: true,
      inMatch: () => false,
      fileDisc: () => false,
      reload: () => { events.push('reload'); },
      showNotice: () => { events.push('notice'); },
    });
    const installing = worker('installing');
    const reg: RegistrationHandle = {
      waiting: null,
      installing,
      update: () => Promise.resolve(),
      addEventListener() {},
    };
    client.applyVersionChange(reg);
    expect(events).toEqual([]);
    expect(installing.messages).toEqual([]);
    installing.state = 'installed';
    expect(client.onInstalled(installing)).toBe('activated');
    expect(installing.messages).toEqual([{ type: 'skip-waiting' }]);
    expect(events).toEqual([]);
    expect(client.onControllerChange()).toBe('reload');
    expect(events).toEqual(['reload']);
  });
});

describe('a file-picked disc', () => {
  it('fetches the new worker and leaves it waiting until Restart, which reloads once', async () => {
    const events: string[] = [];
    const client = createUpdateClient({
      hadController: true,
      inMatch: () => false,
      fileDisc: () => true,
      reload: () => { events.push('reload'); },
      showNotice: () => { events.push('notice'); },
    });
    const next = worker('installed');
    let updates = 0;
    const reg: RegistrationHandle = {
      waiting: null,
      installing: null,
      update: () => {
        updates += 1;
        reg.waiting = next;
        return Promise.resolve();
      },
      addEventListener() {},
    };
    client.applyVersionChange(reg);
    expect(updates).toBe(1);
    expect(events).toEqual(['notice']);
    await Promise.resolve();
    expect(next.messages).toEqual([]);
    client.requestUpdate(next);
    expect(next.messages).toEqual([]);
    expect(client.onControllerChange()).toBe('notice');
    expect(events).not.toContain('reload');
    client.restart(reg);
    expect(next.messages).toEqual([{ type: 'skip-waiting' }]);
    expect(client.onControllerChange()).toBe('reload');
    expect(events.filter((event) => event === 'reload')).toEqual(['reload']);
  });

  it('shows the restart notice and does not activate the worker', () => {
    const events: string[] = [];
    const client = createUpdateClient({
      hadController: true,
      inMatch: () => false,
      fileDisc: () => true,
      reload: () => { events.push('reload'); },
      showNotice: () => { events.push('notice'); },
    });
    const next = worker('installed');
    expect(client.onInstalled(next)).toBe('ignored');
    expect(next.messages).toEqual([]);
    expect(client.onControllerChange()).toBe('notice');
    expect(events).toEqual(['notice', 'notice']);
    expect(events).not.toContain('reload');
    expect(UPDATE_NOTICE).toBe('New version available, restart');
    expect(controllerChangeAction({ firstClaim: false, requestedUpdate: true, inMatch: false, fileDisc: true })).toBe('reload');
    expect(controllerChangeAction({ firstClaim: false, requestedUpdate: true, inMatch: true, fileDisc: true })).toBe('defer');
  });

  it('hides only while a match runs: the launcher and the game\'s front end show it (CX.R18)', () => {
    expect(updateNoticeHidden({ inMatch: false })).toBe(false);
    expect(updateNoticeHidden({ inMatch: true })).toBe(true);
  });

  it('is an image or a folder held in this page, not the served tree or a kept extraction', () => {
    resetFileDiscForTest();
    noteDiscSource({ kind: 'http' });
    noteDiscSource({ kind: 'stored' });
    expect(fileDiscMounted()).toBe(false);
    noteDiscSource({ kind: 'iso' });
    expect(fileDiscMounted()).toBe(true);
    resetFileDiscForTest();
    noteDiscSource({ kind: 'dir' });
    expect(fileDiscMounted()).toBe(true);
    resetFileDiscForTest();
  });
});

describe('CX.R18: the front end mounted or an unsaved edit holds the page as a file-picked disc does', () => {
  const held = (events: string[], o: { inMatch?: () => boolean } = {}) => createUpdateClient({
    hadController: true,
    inMatch: o.inMatch ?? (() => false),
    fileDisc: () => false,
    held: () => true,
    reload: () => { events.push('reload'); },
    showNotice: () => { events.push('notice'); },
  });

  it('an installed worker is not activated: the notice shows; another tab\'s take-over is the notice too; Restart reloads once', () => {
    const events: string[] = [];
    const client = held(events);
    const next = worker('installed');
    expect(client.onInstalled(next)).toBe('ignored');
    expect(next.messages).toEqual([]);
    expect(client.onControllerChange()).toBe('notice');
    expect(events).toEqual(['notice', 'notice']);
    const reg: RegistrationHandle = { waiting: next, installing: null, update: () => Promise.resolve(), addEventListener() {} };
    client.restart(reg);
    expect(next.messages).toEqual([{ type: 'skip-waiting' }]);
    expect(client.onControllerChange()).toBe('reload');
    expect(events.filter((e) => e === 'reload')).toEqual(['reload']);
  });

  it('a version difference with a worker waiting shows the notice and asks nothing of the worker', () => {
    const events: string[] = [];
    const client = held(events);
    const next = worker('installed');
    const reg: RegistrationHandle = { waiting: next, installing: null, update: () => Promise.resolve(), addEventListener() {} };
    client.applyVersionChange(reg);
    client.requestUpdate(next);
    expect(next.messages).toEqual([]);
    expect(events).toEqual(['notice', 'notice']);
  });

  it('a take-over deferred by a match settles to the notice, not a reload, when the match ends on a held page', () => {
    const events: string[] = [];
    let inMatch = true;
    const client = held(events, { inMatch: () => inMatch });
    expect(client.onControllerChange()).toBe('defer');
    expect(client.settle()).toBe(false);
    inMatch = false;
    expect(client.settle()).toBe(true);
    expect(events).toEqual(['notice']);
  });

  it('the holds: the front end\'s hook on the window, or the unsaved-edit mark on <html>; neither, no hold', () => {
    expect(UNSAVED_EDIT_MARK).toBe('data-unsaved-edit');
    expect(reloadHeld({})).toBe(false);
    expect(reloadHeld({ frontEnd: true })).toBe(true);
    expect(reloadHeld({ unsavedEdit: true })).toBe(true);
    const win = (o: { hook?: unknown; marked?: boolean }) => ({
      ...(o.hook !== undefined ? { __frontEnd: o.hook } : {}),
      document: { documentElement: { hasAttribute: (n: string) => o.marked === true && n === UNSAVED_EDIT_MARK } },
    }) as unknown as Window;
    expect(readHoldSignals(win({}))).toEqual({ frontEnd: false, unsavedEdit: false });
    expect(readHoldSignals(win({ hook: { session: {} } }))).toEqual({ frontEnd: true, unsavedEdit: false });
    expect(readHoldSignals(win({ marked: true }))).toEqual({ frontEnd: false, unsavedEdit: true });
    const throwing = { get __frontEnd(): unknown { throw new Error('x'); }, document: null } as unknown as Window;
    expect(readHoldSignals(throwing)).toEqual({ frontEnd: false, unsavedEdit: false });
  });
});

describe('the visible-tab poll', () => {
  it('asks for a new worker only outside a match, on a 10 to 15 minute interval', () => {
    let calls = 0;
    const during = createUpdateClient({
      hadController: true, inMatch: () => true, fileDisc: () => false, reload() {}, showNotice() {},
    });
    during.onPollTick(() => { calls += 1; });
    expect(calls).toBe(0);
    const idle = createUpdateClient({
      hadController: true, inMatch: () => false, fileDisc: () => false, reload() {}, showNotice() {},
    });
    idle.onPollTick(() => { calls += 1; });
    expect(calls).toBe(1);
    expect(RELEASE_POLL_MS).toBeGreaterThanOrEqual(10 * 60 * 1000);
    expect(RELEASE_POLL_MS).toBeLessThanOrEqual(15 * 60 * 1000);
  });
});

describe('LATER 188: after a Shift-reload a take-over the page asked for is not the visit\'s first claim', () => {
  it('a page started with no controller asks for the update; the new worker\'s claim reloads it once (was: ignored, the page left on A under B)', () => {
    const events: string[] = [];
    const client = createUpdateClient({
      hadController: false, inMatch: () => false, fileDisc: () => false,
      reload: () => { events.push('reload'); }, showNotice: () => { events.push('notice'); },
    });
    const next = worker('installed');
    // A Shift-reload: the page has no controller, but the registration has an active worker -- the one it bypassed.
    const reg: RegistrationHandle = { active: worker('activated'), waiting: next, installing: null, update: () => Promise.resolve(), addEventListener() {} };
    client.requestUpdate(next, reg);
    expect(next.messages).toEqual([{ type: 'skip-waiting' }]);
    expect(client.onControllerChange()).toBe('reload');
    expect(events).toEqual(['reload']);
  });

  it("its review's F1: a first visit whose own first worker is briefly waiting when a release check asks is not a take-over -- its claim stays ignored", () => {
    const events: string[] = [];
    const client = createUpdateClient({
      hadController: false, inMatch: () => false, fileDisc: () => false,
      reload: () => { events.push('reload'); }, showNotice: () => { events.push('notice'); },
    });
    const first = worker('installed');
    const reg: RegistrationHandle = { active: null, waiting: first, installing: null, update: () => Promise.resolve(), addEventListener() {} };
    client.requestUpdate(first, reg);                                  // `watchRelease`'s check in the waiting window
    expect(client.onControllerChange()).toBe('ignore');
    expect(events).toEqual([]);
  });

  it("its re-check's F5: a Shift-reloaded page (a worker active, no controller) whose new worker reaches installed by itself asks for it and reloads once", () => {
    const events: string[] = [];
    const client = createUpdateClient({
      hadController: false, inMatch: () => false, fileDisc: () => false,
      reload: () => { events.push('reload'); }, showNotice: () => { events.push('notice'); },
    });
    const next = worker('installed');
    client.noteRegistration({ active: worker('activated'), waiting: null, installing: next, update: () => Promise.resolve(), addEventListener() {} });
    expect(client.onInstalled(next)).toBe('activated');               // was 'ignored' (taken for a first install)
    expect(next.messages).toEqual([{ type: 'skip-waiting' }]);
    expect(client.onControllerChange()).toBe('reload');
    expect(events).toEqual(['reload']);
  });

  it("its re-check 2's F6: a second tab on a very first visit, registered while the first worker still activates, takes that worker's claim as its first", () => {
    const events: string[] = [];
    const client = createUpdateClient({
      hadController: false, inMatch: () => false, fileDisc: () => true,   // held: an unrequested change would show the notice
      reload: () => { events.push('reload'); }, showNotice: () => { events.push('notice'); },
    });
    client.noteRegistration({ active: worker('activating'), waiting: null, installing: null, update: () => Promise.resolve(), addEventListener() {} });
    expect(client.onControllerChange()).toBe('ignore');               // was 'notice': no release, a spurious restart notice
    expect(events).toEqual([]);
  });

  it('a first visit\'s own claim, nothing asked, is still ignored', () => {
    const events: string[] = [];
    const client = createUpdateClient({
      hadController: false, inMatch: () => false, fileDisc: () => false,
      reload: () => { events.push('reload'); }, showNotice: () => { events.push('notice'); },
    });
    expect(client.onControllerChange()).toBe('ignore');
    expect(events).toEqual([]);
  });
});

describe('PT195-5: a broken page', () => {
  it('does not reload itself when the worker changes during a match; Restart does', () => {
    const events: string[] = [];
    const client = createUpdateClient({
      hadController: true,
      inMatch: () => true,
      fileDisc: () => false,
      broken: () => true,
      reload: () => { events.push('reload'); },
      showNotice: () => { events.push('notice'); },
    });
    expect(client.onControllerChange()).toBe('defer');
    expect(events).toEqual([]);
    client.restart({ waiting: null, installing: null, active: worker('activated'), update: () => Promise.resolve(), addEventListener() {} });
    expect(events).toEqual(['reload']);
    expect(events).not.toContain('notice');
  });
});
