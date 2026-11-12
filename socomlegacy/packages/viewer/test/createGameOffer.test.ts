// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { playListNumbers, type MissionRecord, type ZAnimUiCommand } from '@s2u/ui';
import { CREATE_GAME_OFFER_ADAPTATION, CreateGameOfferRead, fetchCreateGameOffer, missionsFromReaderc, offerWithRooms } from '../src/createGameHost';
import { FrontEndSession, type FrontEndDisc } from '../src/frontEnd';
import { servedMapsOf } from '../src/servedMaps';

/**
 * NB-7 (OT.R50, the owner 2026-10-13: "The nightly build should have all of our features from main without the demo
 * considerations"; the nightly plan's NB.R11): the page's CREATE GAME lists the server's offer when the server names
 * one -- `GET /maps` answering `offer: "served"` (the served rule, every server's since LATER 66 retired its
 * setting) -- and the compiled FIRST_RELEASE_MAPS where it names none (a server before the rule, no answer). Read at the page's own
 * origin, as CREATE GAME's own request (`accountServiceBase`), once, started by the room list's request -- never at the
 * mount (`frontEndWiring.test.ts`: a front end over the visitor's disc asks nothing of the network, OT.R14). A browser adaptation of the transport: the original's
 * PLAY LIST is `FUN_00274940`'s rows of the maps present; which maps a server offers is the server's configuration.
 * OT.R58 (the owner 2026-10-16: "limit create match map list to 4 maps (frostfire/crossroads/vig/nightfire)"): the offer
 * read is bounded by FIRST_RELEASE_MAPS -- it narrows the four, never widens them -- while the test room's and the
 * forge's map lists are their own and keep every map (the source checks at the end).
 */

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('fetchCreateGameOffer: <base>/maps read once, the offer\'s map numbers or null', () => {
  it('an explicitly enabled all-map test server offers its played maps beyond the four defaults', async () => {
    expect(await fetchCreateGameOffer('http://h', async () => json(200, {
      maps: ['MP2', 'MP10', 'MP83'], offer: 'served', allCreateGameMaps: true,
    }))).toEqual([2, 10, 83]);
    expect(await fetchCreateGameOffer('http://h', async () => json(200, {
      maps: ['MP2', 'MP10'], offer: 'served', allCreateGameMaps: 'true',
    }))).toEqual([2]);
  });
  it('asks <base>/maps, revalidating the short cache, no header of its own; "served" gives the numbers of the four it names (OT.R58)', async () => {
    const asked: [string, RequestInit | undefined][] = [];
    const offer = await fetchCreateGameOffer('https://nightly.example.com', async (url, init) => { asked.push([String(url), init]); return json(200, { maps: ['MP72', 'MP2', 'MP10', 'MP3', 'MP7', 'MP12', 'MP1'], offer: 'served' }); });
    expect(offer).toEqual([72, 2, 7, 12, 1]);                  // V13-2, V13-3: THE RUINS and BLIZZARD among the six
    expect(asked.map(([u, i]) => [u, i?.cache, i?.headers ?? null])).toEqual([['https://nightly.example.com/maps', 'no-cache', null]]);
  });

  it('LATER 66: a served answer naming no map (central with no host up) offers none -- an empty list, not the four', async () => {
    expect(await fetchCreateGameOffer('http://h', async () => json(200, { maps: [], offer: 'served' }))).toEqual([]);
    expect(await fetchCreateGameOffer('http://h', async () => json(200, { maps: ['MP10', 'MP3'], offer: 'served' }))).toEqual([]);
  });

  it('null -- the release\'s four stand -- on no offer field, a 404 (a server before MAPS-4), a network error, a bad body, or no answer in time', async () => {
    expect(await fetchCreateGameOffer('http://h', async () => json(200, { maps: ['MP2', 'MP7'] }))).toBeNull();
    expect(await fetchCreateGameOffer('http://h', async () => json(404, {}))).toBeNull();
    expect(await fetchCreateGameOffer('http://h', async () => { throw new TypeError('offline'); })).toBeNull();
    expect(await fetchCreateGameOffer('http://h', async () => new Response('<html>', { status: 200 }))).toBeNull();
    expect(await fetchCreateGameOffer('http://h', (_u, init) => new Promise((_r, fail) => { init?.signal?.addEventListener('abort', () => fail(new Error('aborted'))); }), 20)).toBeNull();
  });

  it('is labelled a browser adaptation', () => {
    expect(CREATE_GAME_OFFER_ADAPTATION).toMatch(/GET \/maps/);
  });
});

const MISSIONS: MissionRecord[] = [
  { number: 51, name: 'VIGILANCE', type: 5, multiplayer: true }, { number: 71, name: 'FISH HOOK', type: 4, multiplayer: true },
  { number: 72, name: 'CROSSROADS', type: 2, multiplayer: true }, { number: 1, name: 'BLIZZARD', type: 2, multiplayer: true },
  { number: 2, name: 'FROSTFIRE', type: 5, multiplayer: true }, { number: 6, name: 'DESERT GLORY', type: 4, multiplayer: true },
  { number: 7, name: 'NIGHT STALKER', type: 2, multiplayer: true }, { number: 10, name: 'BLOOD LAKE', type: 4, multiplayer: true },
  { number: 12, name: 'THE RUINS', type: 2, multiplayer: true },
];
const disc = (): FrontEndDisc => ({ dialog: () => null, sets: [], faces: [], captions: null, loader: {}, missing: [] });
const cmd = (fn: string, arg: string): ZAnimUiCommand => ({ anim: 'init_cg_screen', sequence: 'NA', nodeIndex: 0, node: null, opcodeByte: 0, fn, arg, loc: 0, bytes: new Uint8Array(16) });

describe('the session hands the offer to CREATE GAME (FrontEndSession option createGameOffer)', () => {
  const rows = (s: FrontEndSession): number[] => {
    s.host.dispatch(cmd('GetAvailableMPMissions', 'NB7_ROWS'));
    return playListNumbers(s.uiVars.find('NB7_ROWS')?.value);
  };

  it('the eight (V13-2, V13-3, DF-14) the server\'s offer names, read at each GetAvailableMPMissions; none (null or absent): the eight; the whole offer only on the server\'s all-maps word (BAM.R4)', () => {
    let offer: readonly number[] | null = null;
    const s = new FrontEndSession({ disc: disc(), startDialog: 'dlgMenu.rdr', missions: () => MISSIONS, createGameOffer: () => offer });
    expect(rows(s)).toEqual([51, 71, 72, 1, 2, 6, 7, 12]);
    offer = [72, 2, 10];
    expect(rows(s)).toEqual([72, 2]);                         // OT.R58: MP10 (outside the eight) never listed, whatever the offer
    expect(rows(new FrontEndSession({ disc: disc(), startDialog: 'dlgMenu.rdr', missions: () => MISSIONS }))).toEqual([51, 71, 72, 1, 2, 6, 7, 12]);
    // BAM.R4 / P537-L2: the server's CREATE_GAME_ALL_MAPS word (`allBotGames`, `CreateGameOfferRead.allMaps`) lists it whole.
    let all = false;
    const t = new FrontEndSession({ disc: disc(), startDialog: 'dlgMenu.rdr', missions: () => MISSIONS, createGameOffer: () => offer, allBotGames: () => all });
    expect(rows(t)).toEqual([72, 2]);
    all = true;
    expect(rows(t)).toEqual([72, 2, 10]);
  });

  it('the page reads it from its own origin, as CREATE GAME\'s request goes, started by the room list (source inspection)', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/frontEnd.ts'), 'utf8');
    expect(src).toMatch(/new CreateGameOfferRead\(accountServiceBase\(search, win\.location, devBuild\(\)\)\)/);
    expect(src).toMatch(/roomList: offerWithRooms\(fetchRoomListService\(accountServiceBase\(search, win\.location, devBuild\(\)\)\), createGameOffer\)/);
    expect(src).toMatch(/createGameOffer: \(\) => createGameOffer\?\.current\(\) \?\? null/);
  });

  const readerc = resolve(process.env.SOCOM_DISC ?? '__no_disc__', 'RUN/READERC.ZAR');
  it.skipIf(!existsSync(readerc))('the all-map test offer reaches all 22 native mission rows (dev disc)', async () => {
    const missions = missionsFromReaderc(new Uint8Array(readFileSync(readerc)));
    const offer = await fetchCreateGameOffer('http://h', async () => json(200, {
      maps: missions.map(m => `MP${m.number}`), offer: 'served', allCreateGameMaps: true,
    }));
    const s = new FrontEndSession({ disc: disc(), startDialog: 'dlgMenu.rdr', missions: () => missions, createGameOffer: () => offer, allBotGames: () => true });
    expect(missions).toHaveLength(22);
    expect(rows(s)).toEqual(missions.map(m => m.number));
  });
});

describe('CreateGameOfferRead: nothing asked until the player goes online (OT.R14), then one read', () => {
  // P537-L2 (an adaptation: a developer's test server): GAME LOBBY's BOTS widen only on the server's word -- `allMaps()`,
  // true only once an answer says `allCreateGameMaps: true` (central's CREATE_GAME_ALL_MAPS=1); false on every public one.
  it('P537-L2: allMaps() is false until a served answer says allCreateGameMaps: true, and false for any other answer', async () => {
    const answers: unknown[] = [{ maps: ['MP2', 'MP51'], offer: 'served' }, { maps: ['MP2'], offer: 'served', allCreateGameMaps: 'true' },
      { maps: ['MP2', 'MP7'], offer: 'served', allCreateGameMaps: true }];
    const results: boolean[] = [];
    for (const body of answers) {
      const read = new CreateGameOfferRead('http://h', async () => json(200, body));
      expect(read.allMaps()).toBe(false);                     // nothing read yet
      read.ask();
      await new Promise((r) => setTimeout(r, 0));
      results.push(read.allMaps());
    }
    expect(results).toEqual([false, false, true]);
  });

  it('made: no request; the room list\'s first request starts the one read, later ones do not; current() is its answer', async () => {
    const asked: string[] = [];
    const read = new CreateGameOfferRead('http://h', async (url) => { asked.push(String(url)); return json(200, { maps: ['MP10', 'MP51'], offer: 'served' }); });
    const listed: number[] = [];
    const rooms = offerWithRooms({ channelList: async () => { listed.push(1); return []; } }, read);
    expect(asked).toEqual([]);
    await rooms.channelList({ applicationId: 0, pageId: 1, pageSize: 10 } as never, 'T');
    await rooms.channelList({ applicationId: 0, pageId: 1, pageSize: 10 } as never, 'T');
    await new Promise((r) => setTimeout(r, 0));
    expect([asked, listed.length]).toEqual([['http://h/maps'], 2]);
    expect(read.current()).toEqual([51]);                     // OT.R58: MP10 dropped, MP51 kept
  });

  it('CREATE GAME\'s rows reached first (a deep link): current() starts the read and says null meanwhile', async () => {
    const asked: string[] = [];
    const read = new CreateGameOfferRead('http://h', async (url) => { asked.push(String(url)); return json(200, { maps: ['MP2'] }); });
    expect(read.current()).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect([asked, read.current()]).toEqual([['http://h/maps'], null]);
  });

  it('LATER 66 (the review\'s M1): an empty served answer (no host up) is not kept -- the next CREATE GAME open asks again and lists the four once a host is back; a non-empty one is kept', async () => {
    const asked: string[] = [];
    const answers = [{ maps: [], offer: 'served' }, { maps: ['MP10', 'MP2', 'MP7', 'MP51', 'MP72', 'MP1'], offer: 'served' }];
    const read = new CreateGameOfferRead('http://h', async (url) => { asked.push(String(url)); return json(200, answers[Math.min(asked.length - 1, 1)]); });
    expect(read.current()).toBeNull();                         // the first open: the read started
    await new Promise((r) => setTimeout(r, 0));
    expect(read.current()).toEqual([]);                        // the next open: none offered -- and asked again
    await new Promise((r) => setTimeout(r, 0));
    expect(read.current()).toEqual([2, 7, 51, 72, 1]);         // the host back: the six it serves, in the answer's order
    await new Promise((r) => setTimeout(r, 0));
    expect(read.current()).toEqual([2, 7, 51, 72, 1]);
    expect(asked).toEqual(['http://h/maps', 'http://h/maps']);   // kept from then: no new traffic
  });

  it('LATER 455: the room list with its doors passes through too, and starts the same one read', async () => {
    const asked: string[] = [];
    const read = new CreateGameOfferRead('http://h', async (url) => { asked.push(String(url)); return json(200, { maps: ['MP51'], offer: 'served' }); });
    const doors = new Map([['Alpha', 'https://door-a.example']]);
    const rooms = offerWithRooms({ channelList: async () => [], channelListWithDoors: async () => ({ entries: [], doors }) }, read);
    const r = await rooms.channelListWithDoors!({ applicationId: 0, pageId: 1, pageSize: 10 } as never, 'T');
    await new Promise((r) => setTimeout(r, 0));
    expect([r, asked]).toEqual([{ entries: [], doors }, ['http://h/maps']]);
    expect(offerWithRooms({ channelList: async () => [] }, read).channelListWithDoors).toBeUndefined();
  });

  it('no offer reader (no window): the room list as it was', () => {
    const rooms = { channelList: async () => [] };
    expect(offerWithRooms(rooms, null)).toBe(rooms);
  });
});

describe('OT.R58: the test room and the forge keep every map -- their lists are not CREATE GAME\'s offer', () => {
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
  const OFFER = /createGameHost|createGameOfferOf|fetchCreateGameOffer|CreateGameOfferRead|FIRST_RELEASE_MAPS/;

  it('the test room reads a served /maps answer as every map the server plays (TR-2, `servedMapsOf`), outside the four included', () => {
    expect(servedMapsOf({ maps: ['MP51', 'MP3', 'MP6', 'MP72'], offer: 'served' })).toEqual(['MP51', 'MP3', 'MP6', 'MP72']);
  });

  it('neither the test room\'s map bar and read nor any forge module names CREATE GAME\'s offer or its four (source inspection)', () => {
    const files = ['main.ts', 'servedMaps.ts', 'testroomMapBar.ts'];
    const walk = (dir: string): void => {
      for (const e of readdirSync(resolve(SRC, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (e.name.endsWith('.ts')) files.push(rel);
      }
    };
    walk('forge');
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) expect(readFileSync(resolve(SRC, f), 'utf8'), f).not.toMatch(OFFER);
  });
});
