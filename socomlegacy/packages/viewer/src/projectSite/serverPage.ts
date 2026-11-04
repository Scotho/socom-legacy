import { badge, element, link, pageShell, sectionHeading } from './components';
import { siteData, sprintTable, type GeneratedData } from './generated';

/** The server's own words about itself: `GET /health` and `GET /rooms` (`packages/match/src/server.ts`; the public surface, OWNER-4). */
export interface ServerStatus {
  state: 'up' | 'down';
  uptime?: number;
  draining?: boolean;
  rooms?: { map: string; rules: string; players: number; spectators: number; round: number }[];
}
type Fetch = (input: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Asks the server the page was served beside (same origin, no cross-origin request): both answers must have the server's shape.
 * Any refusal, network error or a page that is not JSON (a static host answers `/health` with HTML) is `down`, never an exception.
 */
export async function fetchServerStatus(fetchFn: Fetch = (url) => fetch(url, { cache: 'no-store' })): Promise<ServerStatus> {
  try {
    const health = await fetchFn('/health');
    if (!health.ok) return { state: 'down' };
    const h = await health.json() as { ok?: unknown; uptime?: unknown; draining?: unknown };
    if (h.ok !== true || typeof h.uptime !== 'number') return { state: 'down' };
    const status: ServerStatus = { state: 'up', uptime: h.uptime, draining: h.draining === true };
    try {
      const rooms = await fetchFn('/rooms');
      const list = rooms.ok ? await rooms.json() : null;
      if (Array.isArray(list)) {
        status.rooms = (list as unknown[]).filter((r): r is NonNullable<ServerStatus['rooms']>[number] => typeof r === 'object' && r !== null
          && typeof (r as { players?: unknown }).players === 'number' && typeof (r as { spectators?: unknown }).spectators === 'number');
      }
    } catch { /* the room list is the optional half: the server is up without it */ }
    return status;
  } catch {
    return { state: 'down' };
  }
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400), h = Math.floor(seconds % 86400 / 3600), m = Math.floor(seconds % 3600 / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}

/** Renders a status into its box: the live numbers, or the graceful not-reachable state. */
export function renderStatus(box: HTMLElement, status: ServerStatus): void {
  box.dataset['state'] = status.state;
  if (status.state === 'down') {
    box.replaceChildren(badge('Not reachable'), element('p', '', 'The server is not reachable from this page.'),
      element('p', 'project-fine', 'This page reads the server’s /health and /rooms only when it is served beside the server. Opened from a static site or a development server, it shows this state instead.'));
    return;
  }
  const rooms = status.rooms ?? [];
  const players = rooms.reduce((n, r) => n + r.players, 0);
  const lines: HTMLElement[] = [element('p', '', `Online${status.draining ? ', draining (no new matches)' : ''} · up ${formatUptime(status.uptime ?? 0)}`)];
  if (status.rooms) {
    lines.push(element('p', '', `${rooms.length} ${rooms.length === 1 ? 'room' : 'rooms'} open · ${players} ${players === 1 ? 'player' : 'players'} in matches`));
    const list = element('ul', 'project-milestones');
    for (const r of rooms) list.append(element('li', '', `${r.map} · ${r.rules} · ${r.players} playing, ${r.spectators} watching · round ${r.round}`));
    if (rooms.length) lines.push(list);
  }
  box.replaceChildren(badge('Online', 'active'), ...lines);
}

export function serverPage(data: GeneratedData = siteData, getStatus: () => Promise<ServerStatus> = () => fetchServerStatus()): HTMLElement {
  const shell = pageShell('server', 'The game server', 'Online play', 'The central server that runs SOCOM II Legacy’s accounts, briefing rooms and matches.');
  const main = shell.querySelector('main')!;

  main.append(sectionHeading('What it is', 'Modern infrastructure behind the original’s screens'));
  main.append(element('p', '', 'The game server is one program: the central server the online path of the browser port connects to (the project’s ruling OT.R2). The original’s servers are gone, so this one stands in for them. Its network, storage and security are modern and are the project’s own; only what the player sees and does is kept as the original had it (OT.R27). It is not part of the original game and it changes nothing of the game’s own rules.'));

  main.append(sectionHeading('What it serves'));
  const serves = element('ul', 'project-topics');
  for (const [title, text] of [
    ['Accounts', 'A name and a password, hashed on the server and never kept in the clear; the login and DNAS screens call it. One login per account at a time.'],
    ['Briefing rooms and lobbies', 'The universe list, the briefing rooms, CREATE GAME, the game lobby with its team and ARMORY choices, and push-to-talk voice from the lobby into the round.'],
    ['Matches', 'The round itself: one room per map, stepped at the game’s own 60 Hz, with the round’s state kept on the server and shared with every player.'],
    ['A public status', '/health (is it up, for how long, and which build) and /rooms (anonymous counts per room) are the only public pages, and the box below reads them.'],
  ] as const) {
    const li = element('li'); li.append(element('h3', '', title), element('p', '', text)); serves.append(li);
  }
  main.append(serves);

  main.append(sectionHeading('Status', 'Live from this page’s own origin'));
  const box = element('div', 'project-server-status'); box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
  box.append(element('p', '', 'Checking the server…'));
  const refresh = element('button', 's2u-action s2u-action--tertiary project-reset', 'Check again'); refresh.type = 'button';
  const check = (): void => { void getStatus().then((s) => renderStatus(box, s)); };
  refresh.addEventListener('click', check);
  main.append(box, refresh); check();

  main.append(sectionHeading('How to play online', 'On a server you run yourself'));
  const steps = element('ol', 'project-steps');
  for (const text of [
    'Start the match server from packages/central: PORT=8787 and HOST=:: (listen on IPv6 and IPv4), MAPS naming the maps, DATA_DIR a directory kept between runs (it holds the accounts), SOCOM_DISC your own disc.',
    'Start the page’s development server beside it, with the server’s port named for the page.',
    'Open the page with the development switch and the server’s address: /?devmode&server=ws://localhost:8787/ws. With the extracted game files served, the game starts at once; without them the launcher asks for your disc first and hands both on to the game. Without devmode the game sends account requests to the page’s own origin only; without server= it waits at “locating universes”.',
    'Choose ONLINE on the main menu, log in (a second window needs a second account), select the universe, and create or join a game. Use two browser windows, not tabs, so both play audio.',
  ]) steps.append(element('li', '', text));
  main.append(steps, element('p', 'project-fine', 'The full procedure, and every way it failed before it worked, is the repository’s setup document (SETUP.md, “Running a local two-window playtest”). The game needs your own copy of the disc; none of its data is on this site.'));

  const online = data.sprints.filter((s) => s.online);
  const road = element('section', 'project-generated-section'); road.id = 'online-roadmap';
  road.append(sectionHeading('The online roadmap', 'Read from the repository’s sprint list'), sprintTable(online, 'Online-track sprints'),
    link('The whole roadmap →', `${import.meta.env.BASE_URL}roadmap`, 's2u-action s2u-action--tertiary project-text-link'));
  main.append(road);
  return shell;
}
