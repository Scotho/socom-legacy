import { describe, expect, it } from 'vitest';
import { isPinnedReplayDoor, pinnedReplayDoor, replayDevDoors, replayDoorShaped } from '../src/connectHost';

/**
 * SA-9b (REPLAY_DOOR_ADAPTATION; the server split, SA.R21 (d), SA.R24): a hosted replay is fetched at its host's door --
 * `https://<host>.play.socom2legacy.com/replays/<16 hex>`, or in devmode only `http://127.0.0.1:<5343-5349>/replays/<16 hex>`
 * -- the URL central's grant names (`central/src/replays.ts` `replayUrlOf`), held as a `PinnedReplayDoor`, made only by
 * `pinnedReplayDoor` over that answer, the id the Watched entry's. Doors and ids invented.
 */

const ID = '00000000000000a1';
const PROD = `https://firehuge.play.socom2legacy.com/replays/${ID}`;
const DEV = `http://127.0.0.1:5343/replays/${ID}`;

describe('SA-9b: the pinned replay door', () => {
  it('takes the production door and, in devmode only, the loopback door, for the entry\'s own id', () => {
    const p = pinnedReplayDoor(PROD, ID, false);
    expect(p?.url).toBe(PROD);
    expect(isPinnedReplayDoor(p)).toBe(true);
    expect(pinnedReplayDoor(DEV, ID, true)?.url).toBe(DEV);
    expect(pinnedReplayDoor('http://127.0.0.1:5349/replays/' + ID, ID, true)?.url).toBe('http://127.0.0.1:5349/replays/' + ID);
    expect(pinnedReplayDoor('https://a.play.socom2legacy.com/replays/' + ID, ID, false)).not.toBeNull();
    expect(pinnedReplayDoor('https://a-b-1.play.socom2legacy.com/replays/' + ID, ID, false)).not.toBeNull();
  });

  it('refuses every other form', () => {
    for (const bad of [
      DEV,                                                                   // a dev door without devmode
      `http://firehuge.play.socom2legacy.com/replays/${ID}`,                 // http on production
      `https://firehuge.play.socom2legacy.com:8443/replays/${ID}`,           // a port on production
      `https://firehuge.play.socom2legacy.com/replays/${ID}?x=1`,            // a query
      `https://firehuge.play.socom2legacy.com/replays/${ID}#x`,              // a fragment
      `https://u:p` + `@firehuge.play.socom2legacy.com/replays/${ID}`,      // credentials (split: not an address)
      `https://FIREHUGE.play.socom2legacy.com/replays/${ID}`,                // upper case
      `https://fire_huge.play.socom2legacy.com/replays/${ID}`,               // an underscore
      `https://-fire.play.socom2legacy.com/replays/${ID}`,                   // an edge hyphen
      `https://fire-.play.socom2legacy.com/replays/${ID}`,
      `https://firehuge.play.socom2legacy.com/replays/00000000000000A1`,     // upper-case hex
      `https://firehuge.play.socom2legacy.com/replays/0000000000000a1`,      // 15 hex
      `https://firehuge.play.socom2legacy.com/replays/00000000000000b2`,     // another id
      `https://firehuge.play.socom2legacy.com/replays/`,                     // no id
      `https://firehuge.play.socom2legacy.com/g/${ID}`,                      // another path
      `https://firehuge.example.com/replays/${ID}`,                          // another zone
      'not a url', '',
    ]) expect(pinnedReplayDoor(bad, ID, false), bad).toBeNull();
    for (const bad of [`http://127.0.0.1:5342/replays/${ID}`, `http://127.0.0.1:5350/replays/${ID}`, `http://localhost:5343/replays/${ID}`, `https://127.0.0.1:5343/replays/${ID}`]) {
      expect(pinnedReplayDoor(bad, ID, true), bad).toBeNull();
    }
    expect(pinnedReplayDoor(PROD, 'not an id', false)).toBeNull();
    expect(pinnedReplayDoor(42, ID, false)).toBeNull();
  });

  it('devDoors is false in every production build: devmode and a server= ask for nothing without a development build (52\'s pin)', () => {
    expect(replayDevDoors('?devmode&server=http://127.0.0.1:5340', false)).toBe(false);
    expect(replayDevDoors('?devmode', true, false)).toBe(true);
    expect(replayDevDoors('', true, false)).toBe(false);
    expect(replayDevDoors('?devmode', true, true)).toBe(false);          // the account requests pinned to the origin
    expect(pinnedReplayDoor(DEV, ID, replayDevDoors('?devmode', false))).toBeNull();
  });

  it('replayDoorShaped knows both door forms, whatever the mode (the loader refuses one without its pinned door)', () => {
    expect([PROD, DEV, `http://127.0.0.1:5347/replays/${ID}`].map(replayDoorShaped)).toEqual([true, true, true]);
    expect([`http://127.0.0.1:5340/replays/${ID}`, `http://localhost:5342/segments/1.s2r`, 'https://site.test/replays/' + ID].map(replayDoorShaped)).toEqual([false, false, false]);
  });

  it('review F3: localhost and [::1] at a door\'s port are door-shaped as 127.0.0.1 is; the pinned dev form stays 127.0.0.1', () => {
    expect([`http://localhost:5343/replays/${ID}`, `http://[::1]:5349/replays/${ID}`, `http://LOCALHOST:5345/x`].map(replayDoorShaped)).toEqual([true, true, true]);
    expect([`http://localhost:5303/segments/0.s2r`, `http://[::1]:5342/replays/${ID}`].map(replayDoorShaped)).toEqual([false, false]);
    expect(pinnedReplayDoor(`http://localhost:5343/replays/${ID}`, ID, true)).toBeNull();
    expect(pinnedReplayDoor(`http://[::1]:5343/replays/${ID}`, ID, true)).toBeNull();
  });
});
