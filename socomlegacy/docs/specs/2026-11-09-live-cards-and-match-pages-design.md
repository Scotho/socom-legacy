# The LIVE cards redone, a match history channel, and the match page -- design

> Written 2026-11-09T00:45Z (`date -u`) on `agent/live-cards-design`, cut from `agent/match-stats` at `4d061af97` (PR
> #753's lane head), in a Claude Code session (Opus 5.5) with the owner (Craig) in the seat. Evidence kind: source
> inspection and read-only git at `4d061af97`, and mockups shown to the owner in a browser and chosen by him (copies in
> `assets/live-cards/`). Nothing built or run. It builds on the match stats design
> (`2026-11-07-match-stats-api-design.md`, plan `../plans/2026-11-07-match-stats-tracking.md`) and on sprint 43's LIVE
> channels (`../plans/2026-11-04-web-sprint-43-the-stats-api-and-the-discord-live-channels.md`).

**Track:** product (OT.R53). Discord cards, a match history channel, a match page, assist and damage counts: the
original has none of these. Every new number is a labelled `*_ADAPTATION`; nothing here changes what a round does,
and the career record (`match/src/stats/accountStats.ts`, the 256-byte blob and `applyMatch`) is untouched. Two
pieces touch game data and carry the owner's word below: the medal icons and the map shots.

## 1. The owner's words (2026-11-08/09, in this seat; to be numbered into MISSION by the plan)

The brief, as he wrote it (his rough notes, quoted in part): update the players channel "to use one or more graphics
... same one used for the leaderboard but split into two columns"; on players and ladder "include the [{clan_tag}]
clan tag before the players name, and also include their rank icon to the left of that as retrieved from the server";
for the lobbies, "a full pack of new images ... for each of their background ... use these images for the replay
background as well"; "an external link that looks like /match/{id} that shows a live page for that match with all of
the matches stats that we have tracked as well as a link to the replay"; on the lobby card, the names listed below the
mode, the snapshot moved beside LIVE MATCH without the word, the name "SOCOM Legacy", players and spectators apart and
never above the cap, "Remove the JOIN MATCH entirely."

The calls made in the conversation, verbatim where quoted:

1. **The lobbies channel stays about lobbies** ("it shows lobbies actually not really matches right"): no result card
   there. Results go to a **new match history channel** "modeled after the other but with some of the cool new stats".
2. **The post-match card is the scoreboard** (direction A of three), then **larger, with more info**: "making the match
   history card quite a bit of larger and adding more info (can we do assists??) ... with a nice visual image of each
   map". Score shown: "showing score would be preferable too" -- "post match card" (the post-match card only, not the
   lobby card). Rounds: "just do dots that show which team one each total". The footer: "remove the whole bottom legend
   the link will be below it".
3. **The 24/7 bot room is excluded** from the match history channel: "The 24/7 bot room is excluded specifically."
4. **No JOIN buttons**: the Discord message's "JOIN #k" buttons go with the card's drawn JOIN MATCH; the lobby's title
   is the link instead, with a play symbol: "throw a play button icon in the default text to make it symbolize clicking".
5. **The rank icons are the game's own**: "the game's own, if that is easy. take extractions for central if needed."
   This is the owner's named exception (OT.R34's kind) for the five medal images on central's cards and pages.
6. **The brand package's logo, not drawn text**: "use our brand package for the logo and remove our text".
7. **The lobby card's layout is the manifest** (direction C of the overhaul), split by side ("split it into each
   side"), as first drawn: after two refinements he chose to "go back there". His other notes on it: "the whole
   background could be the shot", "my biggest complaint was mostly the spacing and i dont like the lines" -- see §8.
8. **Approved** as a whole ("approved") on 2026-11-09 before 00:42Z (`date -u` read 00:42Z when this was written), before the lobby card's overhaul, which is item 7.

## 2. Intent

Someone in the Socom Legacy Discord sees, at a glance and in one look across the LIVE category: who is on, ranked and
tagged as the game shows them; each open lobby on its own map's picture, split SEALs / Terrorists; and, in a channel of
its own, a poster-sized scoreboard of every match that just finished, with assists, damage and awards, linking to a
page that holds the whole match and its replay. Players share that link; it unfurls as the scoreboard.

**Goals:** one visual identity for every card; ranks and clan tags everywhere a name is drawn; the match history
channel; `/match/{id}`; assists and damage counted from now on; the owner's map shots behind the cards and the replay.

**Non-goals:** player pages (`/player/{name}`, item 16 of the list shown to the owner; a later set); clan pages; any
number of the round in progress on the lobby card (only ended rounds, as dots); per-round order of the rounds (dots
only); anything the original's rounds do.

**Anti-goals (a failure even if it works):** a card that reads cramped or ruled-up (the owner's complaint); a lobby card
that shows names of a private lobby; numbers that exceed the cap (18/16); a channel that posts the 24/7 bot room's
endless matches; the career record or the ladder changed by assists or damage; disc art committed to git.

## 3. What exists (read at `4d061af97`)

- **Cards on central:** `central/src/lobbyCard.ts` (the lobby card SVG, `lobbyPreviewSvg`, with `emblem()`, `topo()`,
  `crosshair()`, `pips()`, `notchedButton()` drawing JOIN MATCH at :297-299, "SNAPSHOT" at :237-246, "SOCOM II Legacy"
  text), `ladderCard.ts` (the ladder's ten rows, sharing those pieces), rendered by `lobbyPreview.ts`
  (`@resvg/resvg-wasm`, the design system's OFL faces from `shared/fonts`) and served by `lobbyLinkHttp.ts`
  (`/api/lobby/<id>/preview.png`, the ladder's `top.png`).
- **The Worker:** `deploy/discord-live/live.ts` -- four channels (`players`, `lobbies`, `ladder`, `today`); players is a
  text embed (`playersBody` :301), lobbies one embed per lobby with the card image and JOIN buttons (`lobbiesBody` :334,
  W43.R11), ladder and today embeds. It edits one message per channel, save today's, which posts a new message each
  UTC day (`live.ts:75-77`).
- **The data:** `/api/live` (`lobbyLinkHttp.ts:286-287`: `playerNames()`, `lobbyLinks()`; a lobby carries map, mode,
  counts, no names); the stats routes (`statsApiHttp.ts`: `/api/stats/match/<id>`, the player view with `medal` 0-5
  and `clanTag`); SCHEMA V9's `matches`, `match_rounds`, `match_players` (score, kills, deaths, head shots, hits, shots,
  plants, defuses, rescues, team kills, suicides, rounds won/lost, played ms), `match_events` (each kill with weapon,
  part, how; objectives) -- `serviceStore.ts:1578-1597`.
- **Ranks and tags on central:** the ladder's medal (`ladder.ts` `medalOf()` :48, `tierOf()` :67, R155.8-R155.9: medal 1 ENSIGN `Medal_Blue`
  .. 5 ADMIRAL `Medal_Black`, 0 none), the seat's clan tag (`clans.ts` `seatClanTag`, CLAN_TAG_AT_SEAT_READING).
- **The medal images** are on the disc (`Medal_Blue.tif` .. `Medal_Black.tif`, 12 x 12, research 155 §2.3); the
  browser client already decodes them for PLAYER RANKING and the game lobby (`ui/src/screens/ladderLobbyCommands.ts`,
  `gameLobbyCommands.ts`).
- **No damage attribution is recorded.** The match recorder (`match/src/stats/matchRecord.ts`) takes `kill` and
  `objective` events only, from the room's broadcast stream (`matchRecord.ts:18`). Every applied hit passes
  `Room.combat()` (`match/src/room.ts:3154`) with attacker, target and health before/after. Its `combatReport` is a
  boolean playtest instrument (`room.ts:240-248`, `main.ts:185`, `COMBAT_REPORT=1`) that sends `combat` messages to the
  two players' own connections -- no callback, never on in production; `lastHurt` (`room.ts:1769`) holds only the last
  enemy. **So assists need a new hook in `room.ts`.**
- **Assists are on two never-lists today:** `statsApiHttp.ts:20` and the match stats design's exclusions (W43 decision
  2, "KD, never KDA"). The owner's "can we do assists??" and his approval amend both; the plan says so in MISSION.
- **Replays and the match:** `/api/stats/match/<id>` serves ended matches only (MS.R7: "an open one is whereabouts",
  `serviceStore.ts:1531`), with `replay: "/replays/<id>?match=<matchId>"`. The replay batch (the main controller's,
  2026-11-08) builds a viewer page `/replay/<replayId>?match=<matchId>` on #753's head.
- **The brand:** `shared/brand/socom-legacy-wordmark.png` (900 wide, transparent), `sl-icon.png` (256 square),
  original artwork, not game material (`shared/brand/README.md`).
- **The 24/7 bot room** is the FF lobby central keeps (`ff-lobbies.json`, the FF seeder's `createSystemGame`).

## 4. The design

### Part 1 -- one card style, one renderer (central)

A module `central/src/cards/` replaces the pieces scattered in `lobbyCard.ts` / `ladderCard.ts`: the palette (the
cards' ink `#000e11`, brass `#dcb85c`, bone text, a second side colour, teal `#8fc3c7` today), the faces already
loaded, a **name cell** (`[medal] [TAG] Name`, §Part 2), the **brand logo** (the wordmark embedded as a data URI; the SL
mark where only a square fits), a **photo layer** (a map shot under fades, Part 9), and the shared time label. Every
card below uses it. **No drawn emblem and no "SOCOM II Legacy" text** (owner 6); **no "SNAPSHOT" word**. The topo lines
and crosshair marks are retired (owner: "i dont like the lines"; §8 for the lobby card's own rules).

### Part 2 -- the medal and the clan tag on every name

Each name a card draws is `[medal icon] [TAG] Name`: the medal from the ladder's tier (0 = no icon), the tag from the
clan (none = no brackets). The five images are extracted once from the disc on the owner's PC (a tool beside the
existing readers, using the client's decoder), written as PNGs into central's data directory on the box, outside git
(owner 5), and read by the renderer at start; missing files mean no icon, never a failure. At card size they are drawn
at 2x with nearest-neighbour scaling (12 px source). The tag is drawn dimmer than the name.

### Part 3 -- the players channel as an image

`/api/live` grows a `players.image` (a PNG route beside the ladder's), and `playersBody` shows it. The card: logo, the
online count, the names in **two columns**, sorted by medal (highest first) then name (**the builder's call, confirmed
in the mockup**), "+N more" past the card's room. The text list stays in the embed's description for search and
screen readers.

### Part 4 -- the lobby card, overhauled (the manifest, split by side)

**The final layout is the owner's own reference image** (2026-11-09, between 00:45Z and 01:01Z, kept outside git at
`agent-mail/evidence/live-cards-2026-11-09/lobby-card-owner-reference.png`), rebuilt as
`assets/live-cards/lobby-card.html` with his changes on top: "add X/Y to the end of each seal/terrorist row", "dont
include the word players", "include the ROUND 4 |", "dont change the logo up top but can change spacing to match".
It **supersedes the paragraph below where they differ.** The card is **16:9, 1200 x 675**. Top row: the brand
wordmark (the brand file, unchanged, spaced as the reference), a thin vertical rule, the lobby name and the mode in
tracked capitals ("FRIDAY NIGHT SCRIMS / MEDLEY"); at the right "● LIVE | 9:41 PM ET". The map name very large,
**upright and heavy** (Oswald at its heaviest weight, not the italic). Under it the rounds-won dots per side (bigger),
a thin rule, "ROUND 4". Then, close under the score row, an angled dark "UP NEXT" tag with the next map beside it,
**kept quiet** (owner: "make the up next crossroads text italic and make it not so center of attention"; "take the
line under crossroads out there and bring it a bit closer"): a smaller, translucent tag, the map name italic, regular
weight, at about 60% opacity, no rule under it. At the right, the count **"14/16" with no "players" word**, a short rule, "2 watching" in teal. Below, the two
sides, each under a bold side name on a full-width rule in its colour **with the side's filled seats over its seats
("7/8") at the rule's right end**, then two columns of seats (medal, dim `[TAG]`, name; "Open" faint). The fonts are
the bundled `shared/fonts` faces; Oswald is a variable face (200-700), so the builder checks that resvg renders the
700 instance (it may draw only the default) and bundles a static 700 face if not.

Earlier text, kept for the record of how it got here (the striped/stand-in image is the brand key art standing in
for a map shot). From top: the brand wordmark left; **"Live · <time> ET"** right (owner: time beside the
badge, no SNAPSHOT; the round number moved down, below); the map shot behind the top ~60% of the card, toned down
evenly and faded into the ink over a long eased gradient with a soft vignette -- no visible edge (owner: "the fade
seems a bit unprofessional"); then **the title block, centred vertically in the space between the top row and the
rosters**: the lobby name, a thin separator and the mode (MEDLEY or the type) on one small line **above** the map name;
the map name large; **under it the rounds won so far as dots, one group per side in its colour** (SEALs brass,
Terrorists teal, a thin separator between the groups: a filled dot per round won, a hollow dot per round still needed
to win the match, as scorebugs do), with "Round N" beside them; under that, small, **"Up next: <MAP>"** -- the
playlist's next map, left out when there is none (owner, 2026-11-09: "add a dot for how many rounds each have won so
far below frostfire text ... remove the round at the top and include it"; "add a small up next: MAP below the scores.
Move the name (small separator MEDLEY above the frostfire text and recenter it with space left ... Release ready
design."); the count right: **players never above the cap** ("14/16"), spectators as "N watching";
then **SEALs** and **Terrorists**, each listing every seat of its side, filled seats as name cells, empty seats
faintly as open. Before the match starts the line reads "Waiting to start"; a member not yet on a side is listed on the
side the room has placed him, or in a short third line when none. **No JOIN MATCH.** A private lobby keeps its
"Private match" card with no names (as today, LINK.R4).

This needs, per public lobby, its members with **side** and **spectator** flags, medal and tag, and the match's rounds
won per side, the current round and the rounds needed to win: `/api/live`'s lobby gains
`members: [{ name, side, spectator, medal, tag }]`, `rounds: { seals, terrorists, current, toWin }`, `nextMap` (the
playlist's next entry's display name, or absent) and `matchId` (the running match, for Part 8's live link) (public
lobbies only; `rounds` from the match's ended round parts, so nothing of the round in progress shows). This supersedes the
earlier "score on the post-match card only" for the rounds-won count, by the owner's later word. Where the side and the spectator flag
come from is the builder's first read (§6): central's game record if it holds them, else the host's lobby report gains
them (a link-version bump, both sides).

**The Discord message** (owner 4): the `JOIN #k` buttons are removed (W43.R11 amended); each lobby's embed title is the
link to `/online/lobby/<id>`, written **"▶ #k <map> — <lobby name>"**; the description one line: map, mode,
"14/16 · 2 watching", in progress or staging.

### Part 5 -- the ladder and today cards

Both use Part 1's style and Part 2's name cell. The ladder card keeps its ten rows; the 🏅 today channel (MS-7) gets an
image in the same style (the top rows of `/api/stats/today`).

### Part 6 -- assists and damage (match server + central)

**Damage:** per seat per match, the health an enemy's applied hits took (`Room.combat`'s applied branch, the
difference of health before and after; armour excluded -- **the builder's call**, armour is not health). **Assists:**
when a player dies, every *other* enemy who took health from him during that life (since his last spawn) gets one
assist; a minimum of `ASSIST_MIN_DAMAGE_ADAPTATION` (a named constant, value the builder's to propose, starting at any
damage > 0) and **teammates never** (no assist for team damage). Both are counted by the match recorder from **a new
observer hook in `Room.combat()`'s applied branch** (attacker seat, target seat, health taken; not the `combatReport`
instrument, which must stay off), told to central in the round part as two
counters per seat (`match_players.assists`, `match_players.damage`, a SCHEMA V10 migration), served on the match route.
**Never** in the career record, the ladder or the rating. Matches recorded before this ships have none (shown "–").
This is the one part that touches the match server: its own review, and the gameplay seat's word for the `room.ts`
hook line (as MS-3 had). The never-served list (`statsApiHttp.ts:20`) drops assists; damage is served as a total
only (never per hit).

### Part 7 -- the match history channel and the post-match card

A fifth Worker channel, `📜・match-history` (the name **the builder's**, in the LIVE category's form), which **posts**
one message per finished match (never edits a single message): the post-match card as the image, and under it the
link text **"▶ <Map> · <Side> win <a>–<b> · full stats and replay"** (amended by the plan's LCM.R20 to "· full
stats" until the replay page exists) to `/match/<id>` (owner 2, 4). Posted for every
match that ended `complete`, ranked or unranked, **except the 24/7 bot room's** (owner 3; marked on the match row at
its open from the FF lobby flag, so the Worker never has to know -- every lobby `ff-lobbies.json` configures, since
`cli/ff.ts:67` allows several) **and any match with no human account seated** (the builder check's point: a test bot
lobby on the live central would otherwise post; the controller's call) **and any password lobby's match** (the owner,
§8 answer 1). Respawn matches post with the sides' total scores (§8 answer 2). Abandoned matches are not posted. The Worker keeps
the last match id it posted (its KV), reads a new route `GET /api/stats/matches?since=<cursor>` or the existing
`/matches` cursor, and posts in order; a gap after an outage posts the missed matches, oldest first, capped
(`MATCH_HISTORY_CATCHUP_MAX_ADAPTATION`).

**The card** (mockup `assets/live-cards/post-match-card.html`, about 1200 x 1150-1300): the map shot as a band across
the top fading into the card, with the logo, date, length and region, the map name, the mode, ranked/unranked and the
player count, and the result: "<SIDE> WIN" and the round score; **the rounds as dots per side** ("SEALs ●●●● ·
Terrorists ●●", owner 2); six awards -- **MVP** (highest score, kills breaking a tie, then the name), top fragger,
sharpshooter (best HS% with at least `SHARPSHOOTER_MIN_KILLS_ADAPTATION` kills), most assists, first blood (most
round-opening kills), best round (most kills in one round); then **both sides in full**: medal, tag, name, SCORE, K, D,
A, K/D, HS%, ACC, DMG, OBJ (plants + defuses + rescues), top weapon; the MVP's row marked. **No legend and no link in
the image** (owner 2). A tie reads "DRAW". Without Part 6 the A, DMG and most-assists cells are left out, not zeroed.

### Part 8 -- the match page, `/match/{id}`

Mockup `assets/live-cards/match-page.html`. A page on the site (the viewer's page set, a `routes.json` row and central's
nginx row for `/match/`), reading `/api/stats/match/<id>`. Top: the map shot with the logo; map, mode, ranked, the
score with the rounds dots, date, length, the region (derived from the match's `host_id` through the host
directory; **never the host machine's name**, which the match stats design keeps unserved, `statsApiHttp.ts:19-20` --
the mockup's "FIREHUGE1" is wrong), the lobby name; **▶ Watch replay** (to the replay batch's
`/replay/<id>?match=<matchId>`, never a second share route) and copy link. Then the awards; the full scoreboard (the
card's columns plus rescues split out, team kills and time played; a late joiner marked); the rounds (winner, how it
ended, length, first blood, best round); the kill feed one round at a time (time, killer, weapon, victim, head shot,
objectives); kills by weapon (the game's weapon names) and by hit location. Names are plain text until player pages
exist. **Its link preview** is the post-match card (Open Graph image), as the lobby link's is.

**Live** (owner's "a live page for that match"): while the match runs, the page shows a LIVE badge and fills in **at
each round's end** from the round parts already sent; nothing of the round in progress (no kills, no score) is shown
until it ends. This amends MS.R7 for public lobbies' matches: an open match's **ended rounds** are served; a private
lobby's match is served only once ended. The page polls (`MATCH_PAGE_POLL_MS_ADAPTATION`), no socket. **Where the live
link is found:** the lobby page (`/online/lobby/<id>`, where the ▶ title goes) shows "Live match stats" linking to
`/match/<matchId>` while a match runs (`/api/live`'s `matchId`, Part 4); the Discord embed carries no second link.

**Old matches:** the scoreboard rows are kept for good, but an unranked match's events go after 30 days (MS.R6,
`MATCH_EVENTS_UNCOUNTED_RETENTION_DAYS_ADAPTATION`). The page then shows the header, awards that need no events (MVP,
top fragger, sharpshooter, most assists) and the scoreboard, and says the round detail is no longer kept; MS.R6 is not
changed (the controller's call: no new storage cost; the posted card is a permanent image anyway).

> **Superseded in part by the plan's LCM.R6 (the owner, 2026-11-09):** the shots are the owner's 22 stills in git at
> `shared/map-stills/`, not files outside git. **LCM.R7:** every Discord message is its image only (no list text).

### Part 9 -- the map shots

The owner is capturing one shot per map. They are game imagery, so, like the medals, they live in central's data
directory on the box, **not in git** (the builder's call, by RS.R8; the owner can rule otherwise), named by map stem
(`MP9.jpg`), resized and compressed to the cards' width (about 1200 wide, under ~200 KB). The renderer embeds the
map's shot behind the lobby card, the post-match card and the match page's header; a missing shot falls back to the
plain ink. The replay page uses the same shot behind its player (owner: "use these images for the replay background
as well") -- the replay batch's page reads it from central's public `/api/maps/<stem>/shot.jpg` (a route this part
adds).

## 5. Tests the builder writes first

- Name cell: medal 0..5 and tag present/absent each draw as specified; a name with `<` or `&` is escaped.
- Lobby card SVG: never "SNAPSHOT", never "JOIN", never "SOCOM II Legacy"; 18 members with 16 max and 2 spectators
  draws "16/16" and "2 watching"; every seat of each side drawn, empty seats as open; a private lobby draws no name.
- Worker: no `components` buttons on the lobbies message; the title starts with "▶ #k"; the match history poster posts
  once per match id, in order, skips the bot room's and abandoned matches, and resumes from its cursor.
- Assists/damage (match server): a victim hit by A and B and killed by B -> A one assist, B none; a teammate's damage
  gives none; damage counts health only; a death with no other attacker gives none; the career blob byte-identical.
- Post-match card: MVP tie-breaks; "DRAW"; rounds dots equal rounds won; without assists the A/DMG columns absent.
- Match route while live: ended rounds served, the current round absent; a private lobby's open match 404.

## 6. Left to the builder

The side/spectator source (Part 4); the module split; exact sizes, fonts' weights and spacing within the mockups'
look; the channel's name; the constants' values (named, labelled); the extraction tool's shape; how the Worker learns
of new matches (cursor route or `/matches`); the card's height rule for 8 v 8.

## 7. Weighed and not taken

A FINAL result card in the lobbies channel (owner 1: the channel is about lobbies). Per-round order and how each round
ended on the card (owner 2: dots only). Drawn rank icons of our own (owner 5). The highlight-reel card without the full
scoreboard (owner chose the scoreboard). The face-off lobby layout and the full-bleed manifest (owner went back to the
first manifest).

## 8. For the owner

A fresh builder check (2026-11-09, between 00:45Z and 01:00Z) read this design against the code. Its corrections are folded above (the
`room.ts` hook for assists, `medalOf`/`tierOf`, today's daily post, the assists never-lists, the host name). The calls
the controller made from it, for the owner to check while reading: the channel also skips matches with no human seated
and every FF lobby (Part 7); the match page shows the region, never the host machine (Part 8); the live link sits on the
lobby page (Part 8); old unranked matches' pages lose their round detail after 30 days rather than keeping events
longer (Part 8).

The owner's answers (2026-11-09, just before 01:01Z when the lane opened, in the seat, choosing the recommended option each time):

1. **Password ("private") lobbies' matches are not posted** to the match history channel ("Don't post them"). Their
   `/match/<id>` page still exists once ended, for anyone holding the link (MS's rule), and the live page is never
   served for them (Part 8).
2. **Respawn matches are posted, with the sides' total scores** ("Post, team score totals"): the post-match card, the
   link line and the lobby card show each side's total score (the sum of its seats' scores, e.g. "SEALs 412 – 389") in
   place of the rounds score, and **no round dots**; the lobby card's "ROUND N" is left out for respawn. The 24/7 bot
   room stays excluded (owner 3). The side total is computed from `match_players.score` by side (no new column).
3. **"The new Discord role" is the match history channel** ("Yes, the channel"): the bot creates it in the LIVE
   category, as H400/H401 set up the others.

**The owner's word on the lane** (2026-11-09, just before 01:01Z, verbatim): "approved. Take this on yourself and aggressively
complete this task using the resources available to you. Prefer claude code cloud usage and workflows wherever needed.
This lane will be responsible for creating the new discord role and setting it up end to end autonomously with my
approval using the past process of setting up the others as a guide and reference. Only bring me in where the plan
outlines before and we can discuss those now. Get this into the next release that is not currently being gated."

The mockups (`assets/live-cards/`): `post-match-card.html` (final), `lobby-card.html` (release candidate),
`players-card.html` (its lower half; the lobby card in its upper half is superseded), `match-page.html` (its "host"
line superseded by Part 8).
