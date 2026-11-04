// test/addressOnlineTable.ts -- the address's online rule as one table (ADDR-ONLINE, web sprint 15; research 243 §8,
// "A difference found"). `src/addressOnline.ts` is held to it, and so is each of its callers: the page's retest
// placement and recording (`test/playtestSession.test.ts`) and the playtest CLI's retest
// (`packages/playtest/test/retest.test.ts`).
// PLAYTEST_INSTRUMENT_ADAPTATION: the rule is the page's own readers' (`netSettings`, `readShare`), not a game value.

/** `[search, online]`: online when the address names a server (`server`, `mp`) or `online=shared|local`, any case. */
export const ADDRESS_ONLINE_TABLE: ReadonlyArray<readonly [string, boolean]> = [
  // the three words `readShare` takes, in any case (it lower-cases)
  ['?online=shared', true],
  ['?online=local', true],
  ['?online=Shared', true],
  ['?online=LOCAL', true],
  ['?online=off', false],
  ['?online=OFF', false],
  // `netSettings`'s two keys, present with or without a value; they win over `online=off` (`resolveOnline`: URL first)
  ['?server=ws%3A%2F%2F127.0.0.1%3A5305%2Fws', true],
  ['?server=', true],
  ['?mp', true],
  ['?mp&online=off', true],
  ['?devmode&mode=play&map=MP2&server=ws%3A%2F%2F127.0.0.1%3A5305%2Fws&playtest=x&online', true],   // the CLI's own
  // the difference settled the page's way: a bare `online` and another value are not online
  ['?online', false],
  ['?online=', false],
  ['?online=yes', false],
  ['?online=on', false],
  ['?devmode&mode=play&map=MP2&playtest=x&online', false],
  // nothing named, or malformed
  ['', false],
  ['?devmode&mode=play&map=MP2', false],
  ['?online=%E0%A4%A', false],
  ['%%%&=&==', false],
  ['?onlineX=shared&servers=x&m p', false],
];
