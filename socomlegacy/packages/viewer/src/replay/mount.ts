import type { HullCast, ThrowableRecord } from '@s2u/scene';
import type { NetClient, NetOptions, NetWalk } from '../net/client';
import { multiplayerEnabled, onlineTarget } from '../multiplayer';
import { readOnline } from '../online';
import { readShare } from '../shareUrl';
import { devSwitches } from '../source';
import { mountReplayBar } from './controls';
import { mountEmbed, replaySeeker, seekOnOpen, segmentIndex } from './embed';
import { checkReplayUrl, loadSegment, type LoadedSegment } from './load';
import { asNetClient, ReplayClient } from './replayClient';
import { mountTimeline, parseListing, type TimelineListing } from './timeline';

/**
 * The test room's replay mode (web sprint 35 PT-18; W35.R2, W35.R4, W35.R5; spec 4.8; research 244 §1-2).
 * REPLAY_ADAPTATION: a browser adaptation with no original, changing no game value or behaviour (PT.R3).
 *
 * `/testroom?devmode&replay=<url>` on a development build (`replayAsked`), the match capability `replay` on
 * (`TESTROOM_CAPABILITIES`; the front end's switch has it off): `main.ts`'s one branch, ahead of the server's and the
 * offline room's, loads this module and builds a watcher's `NetPage` whose client is `replayClient`'s -- a
 * `ReplayClient` on the segment at the address (`./load`: localhost or 127.0.0.1 only), with the bar and the keys
 * (`./controls`) and a frame loop that plays the records on the replay's clock. Without `?replay=` none of this loads.
 *
 * The map is the segment's (its header's `map`): the page has already loaded the address's `map=` (or the last one)
 * when the segment arrives, so a recording of another map reopens the page once with `map=` set to the header's
 * (`replayMapAddress`); when the address already names it and the page still shows another (a map this tree cannot
 * open), the room is refused with that sentence -- no reload loop.
 *
 * PT-20 (research 244 §4): beside the bar, the session's timeline (`./timeline`: the segments under one clock, their
 * boundaries, the marks; the service's `GET /segments` listing on the replay address's origin when the address is a
 * session segment's) and, when the page is embedded in the session's report, the seek listener (`./embed`: a message
 * from the `embedder=` origin only); a page opened with `tick=` seeks there once the segment opens. Both go with the bar
 * when the page closes the client. RE-6 (research 249 §2): the listing names each segment's map, and the seek into
 * another segment reopens the page on it, so the map rule above has nothing to correct on a session segment.
 *
 * PT-27 (W36.R5; research 245 §5): the address may also be a hosted replay on the page's own configured match server
 * (`replayServer`, `./load` `checkReplayUrl`), fetched with the page's login ticket as its bearer when the page holds one
 * (`ReplayMountDeps.ticket`). The test room holds none -- the login's ticket lives in the front end's lobby client's
 * memory only (`./connectHost`, `FrontEndSession.lobby?.ticket()`), never in storage, and a page opened at `/testroom`
 * is a new page -- so the page's own deps carry no ticket, and a hosted replay a participant alone may see answers it
 * 404 there (research 245 §5).
 */

/**
 * The page's configured match server (W36.R5): the target `main.ts` joins -- `onlineTarget(MULTIPLAYER, SEARCH, () =>
 * SHARE.online ?? readOnline(), PAGE_LOCATION)` (main.ts's `NET`), through `./online` `resolveOnline` -- or null for none
 * (multiplayer off, Online Off). `multiplayer` and `stored` are main.ts's own reads by default.
 */
export function replayServer(
  search: string, location: { protocol: string; host: string; hostname?: string },
  read: { multiplayer?: boolean; stored?: () => string | null } = {},
): string | null {
  const multiplayer = read.multiplayer ?? multiplayerEnabled(import.meta.env.VITE_S2U_MULTIPLAYER as string | undefined);
  const stored = read.stored ?? ((): string | null => readShare(search).online ?? readOnline());
  return onlineTarget(multiplayer, search, stored, location).url;
}

/**
 * CPS.R9 (e) (product track, a dev instrument; `../frameHash`): whether the page asks the replay to stand still once it
 * opens -- `pause` in the address beside `replay=` (`/testroom?devmode&replay=<url>&tick=<t>&pause`). The recording plays
 * from its open (`ReplayClient`'s `clock.play()`), and a `tick=` seek keeps it playing; with `pause` the clock is paused
 * at the open, before the seek, so the seek sets the tick exactly and the page draws that tick's frame every time (the
 * frame identity gate, `e2e/zz-frame-identity.spec.ts`). Space plays on as before. REPLAY_ADAPTATION: no game value.
 */
export function replayPauseAsked(search: string): boolean {
  try { return new URLSearchParams(search).has('pause'); } catch { return false; }
}

/** Whether the page asks for the replay mode: `?devmode` and `replay=` on a development build. */
export function replayAsked(search: string, dev: boolean = import.meta.env.DEV): boolean {
  if (!dev || !devSwitches(search, dev).tools) return false;
  try { return new URLSearchParams(search).has('replay'); } catch { return false; }
}

/**
 * What the page does with a recording of map `headerMap` while it shows `shown`: nothing (null) when they are the
 * same; else reopen on the address with `map=` the header's (`navigate`, a search string, every other parameter as it
 * was); else, when the address already names that map, refuse with a sentence.
 */
export function replayMapAddress(search: string, headerMap: string, shown: string): { navigate: string } | { refuse: string } | null {
  const want = headerMap.toUpperCase();
  if (want === shown.toUpperCase()) return null;
  const parts = search.replace(/^\?/, '').split('&').filter(Boolean);
  const key = (p: string): string => { try { return decodeURIComponent(p.split('=')[0]!); } catch { return p; } };
  const i = parts.findIndex((p) => key(p) === 'map');
  const asked = i >= 0 ? (parts[i]!.split('=')[1] ?? '') : null;
  if (asked !== null && decodeURIComponent(asked).toUpperCase() === want) {
    return { refuse: `This recording is of map ${want}, which the page could not open.` };
  }
  const pair = `map=${encodeURIComponent(want)}`;
  if (i >= 0) parts[i] = pair; else parts.push(pair);
  return { navigate: `?${parts.join('&')}` };
}

export interface ReplayMountDeps {
  document: Document;
  location: Pick<Location, 'search' | 'pathname' | 'hash' | 'replace'>;
  fetch?: typeof fetch;
  frame?: (run: () => void) => void;
  /**
   * PT-20: reads the service's segment listing (`GET /segments`) for the timeline; absent, the timeline shows the
   * segment playing alone (the page's own default fetches it).
   */
  listing?: (url: string) => Promise<unknown>;
  /**
   * PT-27: the page's configured match server (`replayServer`); absent or null, the localhost rule alone. A function is
   * read as each client is made, so an in-page Online change reaches the next replay client (PT-27's review nit).
   */
  server?: string | null | (() => string | null);
  /** PT-27: the page's login ticket, the bearer of a hosted replay's fetch only (`./load`); absent, none is held. */
  ticket?: () => string | null;
}

/**
 * LATER 32: what the page's own parts hand the replay mode -- the page's throwable records by the wire's kind (the
 * thrower's, `MatchThrowables.throwable`: the baked ones and the disc's `KitTable.throwables`, handed with the map), so
 * the seek's fold lays C4 and the PMN with the records the page draws them by. Read at each fold, never copied.
 *
 * RV-7c-2 (research 276 §6): and the hull the page's throwables fly over -- the room's own flight surface
 * (`Room.hullCast`: the walk's grid with the map's `DefaultMaterial`, `gridCast`), main.ts's `replayHull` -- so the
 * seek's fold flies a recorded AN-M8 into the welcome's `join.projectiles` (RV-7, `ReplayClientOptions.hull`). Read at
 * each seek, never copied; null while the page holds no world of the map (none folded, as without it).
 *
 * RV2-03 (RV2.R2: no tick advances while the world's loading screen shows): and the page's loading hold, `held` --
 * main.ts's `loadingJoin.blocked`, true while the test room's loading screen shows. Handed, the client opens held
 * (`ReplayClientOptions.autoplay` false: paused at its start, a `tick=` or an embedder's seek still landing), the frame
 * loop skips `advance` while it is true, and the first frame it is false releases the client, which plays from there.
 * Absent, as before: the client plays from its open, the loop advancing every frame. A browser adaptation
 * (REPLAY_ADAPTATION), no game value.
 */
export interface ReplayPageHooks {
  throwable?(kind: string): ThrowableRecord | null;
  hull?(): HullCast | null;
  held?(): boolean;
}

/**
 * The segment loaded once a page (a map's reload of the room reuses it), by its address -- kept only once it has loaded
 * as a closed segment (gzip): a failed load, or a live segment's prefix (which grows), is fetched again at the next
 * room's build (the review's N3).
 */
let loaded: { url: string; segment: Promise<LoadedSegment> } | null = null;

/**
 * The `NetPageDeps.client` factory of the replay mode: a `ReplayClient` on the address's segment, its bar and its
 * frame loop (stopped when the page closes the client). `page.throwable` (LATER 32) goes to the client's fold
 * (`ReplayClientOptions.throwable`); absent, the fold's baked set. `page.hull` (RV-7c-2) goes to its
 * `ReplayClientOptions.hull`; absent, no smoke is folded (RV-7). `page.held` (RV2-03) holds the client and the loop while
 * the page's loading screen shows; absent, none.
 */
export function replayClient(search: string, deps?: ReplayMountDeps, page: ReplayPageHooks = {}): (opts: NetOptions, walk: NetWalk) => NetClient {
  const d: ReplayMountDeps = deps ?? {
    document, location, fetch: globalThis.fetch.bind(globalThis), frame: (run) => { requestAnimationFrame(run); },
    listing: async (url) => { const res = await globalThis.fetch(url, { cache: 'no-store' }); return res.ok ? res.json() : null; },
    server: () => replayServer(search, location),
  };
  return (opts) => {
    let segment: Promise<LoadedSegment>;
    let address: string | null = null;
    try {
      const server = (typeof d.server === 'function' ? d.server() : d.server) ?? null;
      const url = checkReplayUrl(new URLSearchParams(search).get('replay') ?? '', { server }).href;
      address = url;
      if (loaded?.url !== url) {
        const p = loadSegment(url, { ...(d.fetch ? { fetch: d.fetch } : {}), server, ...(d.ticket ? { ticket: d.ticket } : {}) });
        const entry = { url, segment: p };
        loaded = entry;
        const forget = (): void => { if (loaded === entry) loaded = null; };
        p.then((seg) => { if (!seg.closed) forget(); }, forget);
      }
      segment = loaded!.segment;
    } catch (e) {
      segment = Promise.reject(e);
    }
    const client = new ReplayClient(segment, {
      name: opts.name, map: opts.map, ...(opts.world ? { world: opts.world } : {}),
      ...(page.throwable ? { throwable: (kind: string) => page.throwable!(kind) } : {}),
      ...(page.hull ? { hull: () => page.hull!() } : {}),
      ...(page.held ? { autoplay: false } : {}),          // RV2-03: held until the page's loading screen has gone
      check: (seg) => {
        const r = replayMapAddress(d.location.search, seg.header.map, opts.map);
        if (r && 'navigate' in r) {
          d.location.replace(`${d.location.pathname}${r.navigate}${d.location.hash}`);
          return `Opening the recording's map, ${seg.header.map.toUpperCase()}.`;
        }
        return r ? r.refuse : null;
      },
    });
    const bar = mountReplayBar(d.document, client);
    // PT-20: the seek (the embedder's and the timeline's), the timeline, the listener, `tick=`; RE-6: the one listing
    // read serves the timeline and the seek (the target segment's map, research 249 §2)
    const playing = address !== null ? segmentIndex(address) : null;
    const listing: Promise<TimelineListing | null> | null = playing !== null && d.listing
      ? d.listing(new URL('/segments', new URL(address!).origin).href).then(parseListing, () => null)
      : null;
    const seek = replaySeeker({ search, client, location: d.location, listing });
    const timeline = mountTimeline(d.document, {
      playing, listing, seek,
      tick: () => (client.state === 'open' ? client.serverTick() : null),
      span: () => (client.state === 'open' ? client.span() : null),
      marks: () => (client.segment?.records ?? []).flatMap((r) => (r.kind === 'mark' ? [{ segment: playing ?? 0, tick: r.tick }] : [])),
    });
    const view = d.document.defaultView;
    const embed = view ? mountEmbed({ window: view, search, seek }) : null;
    // CPS.R9 (e): `pause` paused at the open, registered before `seekOnOpen` so the seek lands on a paused clock (exact tick)
    if (replayPauseAsked(search)) void client.ready.then(() => { if (client.state === 'open') client.pause(); });
    seekOnOpen(search, client);
    const loop = (): void => {
      if (client.state === 'closed') { bar.dispose(); timeline.dispose(); embed?.dispose(); return; }
      if (!page.held?.()) {                                 // RV2-03: no advance while the page's loading screen shows
        if (client.held()) client.release();
        client.advance();
      }
      bar.render();
      timeline.render();
      d.frame?.(loop);
    };
    loop();
    return asNetClient(client);
  };
}
