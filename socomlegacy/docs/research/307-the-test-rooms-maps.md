# 307 -- The test room's maps: LOCAL online's refusal and the server's served set

> Written 2026-10-12 (`date -u` 16:00Z) for TR-2 of the test room's maps plan
> ([`../plans/2026-10-12-the-test-rooms-maps.md`](../plans/2026-10-12-the-test-rooms-maps.md), rulings TR.R1 and TR.R3),
> against `agent/playtest` 91933be51 (TR-1 merged). Number 307 assigned by the merge controller, 2026-10-12.

**No parity finding.** The test room, its LOCAL online and the bar's map dropdown are a test instrument's adaptation
(TR.R2; the test room's keyboard is still a development build's only, OT.R29 -- the bar's key listeners undo a key's
change of the closed select and read no key as input, listed as such in `test/keyboardGate.test.ts`; *corrected
2026-10-12, at the landing: this said OT.R29 did not bind the test room*). The original asks no server which maps it plays, and nothing here changes
a game value or behaviour: the refusal is the server's own, and the marks only label the dropdown's options.

Evidence kinds are kept apart: **[source]** = read in this repository's code; **[unit]** = a vitest/jsdom test of this
change; **[agreed]** = a shape another lane decided and has not landed yet; **[not run]** = owed to a browser or a real
server.

## 1. The owner's words

The owner's playtest of 2026-10-12, relayed by the merge controller (TR.R1): "When in testroom mode, LOCAL online just
says 'no such map'." His server ran `MAPS=MP2,MP51,MP72`, and he chose MP6 and MP10.

## 2. The refusal: what the page hears, and what it now says

- [source] The server refuses a hello whose map it does not play with code 4004 and the reason `'no such map'`, its
  detail `{ map: String(ev.map) }` -- the hello's own map (`packages/match/src/server.ts` :806; `allowed()` :692-695
  plays a stem only if `MAPS` is empty or names it, uppercased).
- [source] `refuse()` (:916-920) logs the detail but **sends the frame `{ type: 'refused', reason }` only** (:918): the
  detail never reaches the page. The protocol's event is `{ type: 'refused'; reason: string }`
  (`packages/viewer/src/net/protocol.ts` :958).
- [source] Before TR-2 the client set `state = 'refused'` (`net/client.ts`, the `'refused'` case of `event()`), the
  page's `NetPage` kept the reason (`netPage.ts`, its `'refused'` case) and `status()` handed it to the Online line as
  `refused: <reason>` (`online.ts` `onlineLine`), in the folded settings panel; `onlineToast` gave no toast for a
  refusal. So the owner saw `no such map` (the HUD's message window, `hud.postMessage(ev.reason)`, and the folded line)
  and nothing naming the map.
- **What TR-2 does** [unit]:
  - `NetClient.refusal` (additive): on a refused frame, `{ reason, map }` with the map its hello named (`opts.map`) --
    by :806 exactly the map the server's detail names, which the frame does not carry.
  - `online.ts` `withRefusalMap(status, client.refusal)` puts that map on the status (`OnlineStatus.map`, additive)
    only for a refusal whose reason is `NO_SUCH_MAP` (`'no such map'`, the server's words) and matches the client's.
  - The Online line reads `refused: no such map (MP6)`; the toast (`onlineToast`, shown by `main.ts` `showOnline` once
    at the headline change, where the player looks) reads `Online: refused: no such map (MP6)`. The server's reason is
    verbatim, the map after it.
  - Every other refusal keeps today's words: the line `refused: <reason>`, no toast, no map.
  - `netPage.ts` is untouched (another seat's file): `main.ts` `showOnline` wraps `net.status()` with the client's
    refusal (one line).
- Should a later server send the detail on the frame, the page could read it there instead; nothing here depends on it.
- Scope: `net/client.ts`'s edits are the `refusal` field (:200-206) and the `'refused'` case (:525), clear of PAR-37's
  claimed :557-564.

## 3. The served set before joining: `GET /maps`

- [agreed] The shape (TR.R3; the online lane's, 2026-10-12, relayed by the merge controller): `GET /maps` answering
  `{"maps":["MP2","MP51","MP7","MP72",...]}` -- the stems the server plays (`MAPS`, else its defaults), uppercase as
  `/rooms`' `map`, in the server's order; the same origin gate and short public cache as `/rooms`; no connection
  needed. **It lands in the online lane's MAPS-4**; no server in this tree answers it yet.
- [unit] The reader, `packages/viewer/src/servedMaps.ts`:
  - the origin is the online target's (`resolveOnline`'s `url`, the server the room joins): `ws:` to `http:`, `wss:` to
    `https:`, the path dropped -- the host the page's `/rooms` poll reads beside it (`playersOnline.ts` `LOCAL_ROOMS`,
    `SHARED_ROOMS`). No target (Online off), the page's own rooms (`loopback:`, `replay:`) or a non-WebSocket address:
    no read.
  - `fetchServedMaps(origin, fetch)` returns the stems, or `null` on a 404 (a server before MAPS-4), a network error, a
    body that is not JSON, a wrong shape, an empty list or no answer within `SERVED_MAPS_TIMEOUT_MS_PLACEHOLDER` (the
    request then aborted). A lowercase stem is read uppercase: the server compares a hello's map uppercased
    (`allowed()` :694), and `/rooms`' map is read so (`playersOnline.ts` `countPlayers`). `cache: 'no-cache'` and no
    header of the page's own, as the `/rooms` poll (a non-safelisted header would add a CORS preflight).
  - `ServedMapsRead` is the page's one read per target: `null` at once (the old server's marks off), then the answer; an
    answer that lands after a newer read is dropped.
- [unit] With an answer, the bar's dropdown (TR-1's `MapBar`, `testroomMapBar.ts` `markServed`; `ui.ts`
  `markServedMaps`) marks each map not in the set with the suffix ` · not on this server` (`NOT_SERVED_SUFFIX`, the test
  instrument's words, after the panel picker's ` · 3 playing` pattern). Never hidden: every map keeps its place and its
  value, the room's map stays selected, and a choice still reloads the room. The panel's picker is not marked.
- [unit] With no answer (`null`), nothing is marked: TR-1's bar as it was, so an older server still works, and the 4004
  refusal is still shown in the server's words (§2).
- [source] `main.ts`, beside TR-1's `ui.onBarMap(...)` hook: the read starts at the page's start with `NET.url`, and
  again when the Online choice moves (`ui.onOnline`, the choice resolved as the page's own handler resolves it), on the
  served tree and outside the replay's world only (where the bar can show).
- [unit] TR-2's review (59848254f, FAIL high): `ui.ts` `onOnline` attached a click listener per handler, each returning
  when its button was already pressed; the re-read, registered first, pressed it, and the page's own handler (the choice
  written, the address, `NET`, `/rooms`, the reconnect) never ran. `onOnline` now keeps a list of handlers behind one
  listener, called in registration order after the press. The re-read resolves its server from the choice itself
  (`resolveOnline`), so it needs nothing of the page's handler, which runs after it as before. The rendered case is
  `e2e/testroomMapBar.spec.ts`, "Online Off -> Local in the panel ...".
- Not done (optional in the brief): the Online line saying before the join that the room's own map is not played.

## 4. Placeholders

| name | value | where | status |
|---|---|---|---|
| `SERVED_MAPS_TIMEOUT_MS_PLACEHOLDER` | 10 000 ms (`playersOnline.ts` `REQUEST_TIMEOUT_MS`) | `packages/viewer/src/servedMaps.ts` | placeholder: a chosen instrument limit with no original -- how long the page waits for its online server's `GET /maps` before it marks nothing; the `/rooms` read's own bound, as the same server answers both. Settled by the owner's call or a measured `/maps` time on a slow host; past it the cost is an unmarked bar, never a wrong mark. Never a deviation of the round (research 101 §5) |

## 5. What only a browser or the real `/maps` can check

- **[rendered, 2026-10-12]** The bar's marks in a rendered page: `e2e/testroomMapBar.spec.ts`, "Online = Local: the bar marks the maps the
  server's /maps does not name ...", routes the run's Local port's `/maps` to the owner's set (no server started). Run on `b6e58b3df`, 16:39:18Z-16:39:46Z,
  headless Chromium: passed (the spec 6 passed; the plan's Log).
- **[rendered, 2026-10-12]** The Online switch moving the room: `e2e/testroomMapBar.spec.ts`, "Online Off -> Local in the panel: the room
  moves to Local, and /maps is asked and marks the bar" (TR-2's review case: the page's own handler runs -- the choice
  stored, `online=local` in the address, the Online line off "single player" -- and `/maps` is asked); passed in the
  same run (`b6e58b3df`, 16:39:18Z-16:39:46Z, headless Chromium).
- [not run] The refusal's toast and line on a live server with `MAPS` set (the spec above does not start one).
- [not run] The real `/maps` once MAPS-4 lands: its CORS header on a page served from another port, and its answer's
  case and order.
- [not run] A long label's suffix in the closed select, capped at 16rem (10rem on a phone, TR-1): the suffix may be cut
  off on the room's own map when the server does not play it.
