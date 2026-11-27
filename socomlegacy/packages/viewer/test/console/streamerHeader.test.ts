// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { headerHtml } from '../../src/console/render/header';
import { personaItems } from '../../src/console/render/profile';
import { signedOutHtml } from '../../src/console/render/signedOut';
import { cardLine, homeItems } from '../../src/console/state';
import { signedInWords } from '../../src/console/grammar';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState, type Adapters } from '../../src/console/state';
import { resetStreamerCache, saveStreamerRow, setStreamerMode } from '../../src/streamerMode';

/**
 * STREAMER-P1 slice 1 (product track, a browser adaptation; the scope's s2 "Indicator" and s3.4 "My account name"): the
 * launcher header carries "STREAMER MODE" while the mode is On, and this player's account name reads "YOU" while details
 * are Hidden -- in the header and in the profile's persona list. Off: as before.
 */
beforeEach(() => { localStorage.clear(); resetStreamerCache(); });
afterEach(() => { localStorage.clear(); resetStreamerCache(); });

const signedIn = (name: string): Adapters => {
  const A = sampleAdapters();
  A.session = { ...A.session, signedIn: () => true, persona: () => name };
  return A;
};
const dom = (html: string): HTMLElement => { const d = document.createElement('div'); d.innerHTML = html; return d; };

describe('STREAMER-P1: the launcher header', () => {
  it('Off: the account name as before and no tag', () => {
    const A = signedIn('KiLL');
    const d = dom(headerHtml(createState(A), A));
    expect(d.querySelector('.cx-player__name')!.textContent).toBe('KiLL');
    expect(d.querySelector('.cx-player')!.getAttribute('aria-label')).toBe('Account: KiLL');
    expect(d.querySelector('[data-streamer-tag]')).toBeNull();
    expect(d.innerHTML).not.toMatch(/STREAMER MODE/);
  });

  it('On: the tag, and the name reads YOU (label too); the name nowhere in the header', () => {
    setStreamerMode(true);
    const A = signedIn('KiLL');
    const d = dom(headerHtml(createState(A), A));
    expect(d.querySelector('[data-streamer-tag]')!.textContent).toBe('STREAMER MODE');
    expect(d.querySelector('.cx-player__name')!.textContent).toBe('YOU');
    expect(d.querySelector('.cx-player')!.getAttribute('aria-label')).toBe('Account: YOU');
    expect(d.innerHTML).not.toMatch(/KiLL/);
  });

  it('On with details Shown: the tag stays, the name is shown', () => {
    setStreamerMode(true);
    saveStreamerRow('details', 'shown');
    const A = signedIn('KiLL');
    const d = dom(headerHtml(createState(A), A));
    expect(d.querySelector('[data-streamer-tag]')).not.toBeNull();
    expect(d.querySelector('.cx-player__name')!.textContent).toBe('KiLL');
  });
});

describe('STREAMER-P1: the profile\'s persona list', () => {
  it('Off as before; Hidden: every persona, the signed-in one and the match name read YOU', () => {
    const A = sampleAdapters();
    A.profile = {
      personas: () => ({ kind: 'ok', slotLine: 'Slot 1', rows: [{ id: 'p1', name: 'KiLL', host: '', signedIn: true }, { id: 'p2', name: 'NIGHTOWL', host: 'lan', signedIn: false }],
        empty: null, signedIn: 'KILLSESSION', held: false, create: { kind: 'ready', line: 'Make one' }, locked: null }),
      locked: () => null, matchName: () => 'KiLL_TV',
    } as unknown as NonNullable<Adapters['profile']>;
    const before = personaItems(A);
    expect(before.length).toBeGreaterThan(3);
    setStreamerMode(true);
    const after = personaItems(A);
    expect(after.length).toBe(before.length);
    after.forEach((it, i) => {
      const b = before[i]!;
      if (b.kind === 'persona' || b.kind === 'session') expect(it.title).toBe('YOU');
      else if (b.kind === 'match-name') expect(it.sub).not.toContain('KiLL_TV');
      else expect(it.title).toBe(b.title);
    });
    const names = [...before.filter((x) => x.kind === 'persona' || x.kind === 'session').map((x) => x.title), 'KiLL_TV'];
    for (const n of names) expect(JSON.stringify(after)).not.toContain(n);
  });
});

describe('STREAMER-P1: the launcher, its other own-name lines', () => {
  it('Home card line, Signed in as, the sign-in toast and the Signed out screen: as before Off, YOU while Hidden', () => {
    const A = signedIn('KiLL');
    A.card = { ...A.card, personas: () => 1, persona: () => 'KiLL' };
    const S = createState(A);
    const home = (): string => JSON.stringify(homeItems('online', S, A));
    expect(cardLine(A)).toContain('KiLL');
    expect(home()).toContain('Signed in as KiLL');
    expect(signedInWords('KiLL')).toBe('Signed in as KiLL');
    expect(signedOutHtml({ name: 'KiLL' })).toContain('KiLL');
    setStreamerMode(true);
    expect(cardLine(A)).toBe('Slot 1 · 1 persona · YOU');
    expect(home()).not.toContain('KiLL');
    expect(signedInWords('KiLL', 'Welcome')).toBe('Signed in as YOU. Welcome');
    const out = signedOutHtml({ name: 'KiLL' });
    expect(out).not.toContain('KiLL');
    expect(out).not.toMatch(/>KI</);                   // the ring's initials neither
  });
});
