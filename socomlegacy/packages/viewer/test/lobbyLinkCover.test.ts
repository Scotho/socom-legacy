// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DialogDesign, InviteLink, PadSlotName } from '@s2u/ui';
import { FrontEndSession, type FrontEndDisc } from '../src/frontEnd';
import type { InviteMount } from '../src/inviteHost';
import { LOBBY_LINK_COVER_ID, LOBBY_LINK_COVER_LINE, showLobbyLinkCover } from '../src/lobbyLinkCover';
import { LOBBY_LINK_DIRECT_STALL_FRAMES_ADAPTATION } from '../src/lobbyLinkDirect';

/**
 * OT.R121's page half (LOBBY_LINK_DIRECT_ADAPTATION; product track): while a lobby link's login path runs behind the
 * cover, the cover stands over the front end's canvases and the menus read no pad -- the player's presses never reach a
 * screen they cannot see; the cover goes at the reveal. Fakes only: no game data.
 */

const design = (): DialogDesign => ({
  libraries: [], usesMemcard: false, font: null, fontLib: true, background: null,
  bindings: [{ kind: 'event', name: 'ONSTART', code: 0, state: 1, animation: 'menu_fade_up', argument: null }],
  controls: [], objects: [], scripts: [], models: [], dropped: [],
});
const disc = (names: string[]): FrontEndDisc => ({ dialog: (n) => (names.includes(n) ? design() : null), sets: [], faces: [], captions: null, loader: {}, missing: [] });
const LOBBY: InviteLink = { mediusWorldId: 0, game: '', universe: null, lobbyId: 'TOwttYxGFFw' };
const mount = (direct: boolean): InviteMount => ({
  link: LOBBY, id: 'S', open: () => null, pending: () => true, consumed: () => {}, href: () => '', copy: () => Promise.resolve(true),
  ...(direct ? { direct: { account: 'Bravo' } } : {}),
});

describe('the cover (a browser adaptation\'s own page element)', () => {
  it('shown once over the page with its one line; hidden, gone; a second hide does nothing', () => {
    const a = showLobbyLinkCover(document);
    const b = showLobbyLinkCover(document);
    expect(document.querySelectorAll(`#${LOBBY_LINK_COVER_ID}`)).toHaveLength(1);
    expect(document.getElementById(LOBBY_LINK_COVER_ID)!.textContent).toBe(LOBBY_LINK_COVER_LINE);
    a.hide(); b.hide();
    expect(document.getElementById(LOBBY_LINK_COVER_ID)).toBeNull();
  });
  it("its look is its own sheet's, by the id: no inline style on the element (the viewer chrome's rule)", () => {
    const c = showLobbyLinkCover(document);
    expect(document.getElementById(LOBBY_LINK_COVER_ID)!.getAttribute('style')).toBeNull();
    c.hide();
    const sheet = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/lobbyLinkCover.css'), 'utf8');
    expect(sheet).toMatch(new RegExp(`#${LOBBY_LINK_COVER_ID} \\{[^}]*position: fixed; inset: 0; z-index: 2147483000; background: #000; color: #ccc;`));
  });
});

describe('the session\'s menus read no pad while the cover stands', () => {
  const held = async (direct: boolean): Promise<number> => {
    const s = new FrontEndSession({ disc: disc(['dlgNetLogin.rdr']), startDialog: 'dlgNetLogin.rdr', invite: mount(direct) });   // LOGIN: on the path, so no reveal
    s.input.source = { read: () => ({ down: new Set<PadSlotName>(['CROSS']), stickX: 0, stickY: 0 }) };
    let now = 0;
    for (let i = 0; i < 10; i++) { s.advance(now += 1000 / 30); await Promise.resolve(); }
    expect(s.invite.covering()).toBe(direct);
    return s.input.pad.state('CROSS');
  };

  it('no mark: CROSS held reaches the menus\' pad; the mark: the pad reads nothing', async () => {
    expect(await held(false)).not.toBe(0);
    expect(await held(true)).toBe(0);
  });

  it('revealed (a bound reached: the screen\'s stall here, the join\'s lifts the same flag): the pad is read again', async () => {
    const s = new FrontEndSession({ disc: disc(['dlgNetLogin.rdr']), startDialog: 'dlgNetLogin.rdr', invite: mount(true) });
    s.input.source = { read: () => ({ down: new Set<PadSlotName>(['CROSS']), stickX: 0, stickY: 0 }) };
    let now = 0;
    for (let i = 0; i < 10; i++) { s.advance(now += 1000 / 30); await Promise.resolve(); }
    expect([s.invite.covering(), s.input.pad.state('CROSS')]).toEqual([true, 0]);
    for (let i = 0; i < LOBBY_LINK_DIRECT_STALL_FRAMES_ADAPTATION + 30; i++) s.advance(now += 1000 / 30);
    expect(s.invite.covering()).toBe(false);
    expect(s.input.pad.state('CROSS')).not.toBe(0);
  });
});
