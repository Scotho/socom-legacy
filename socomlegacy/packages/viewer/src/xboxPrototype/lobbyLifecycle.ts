import type { ClientEvent, ServerEvent } from '../net/protocol';

type Lobby = Extract<ServerEvent, { type: 'gameLobby' }>;
/** Experiment-only presentation of the existing lobby wire. The server owns all
 * readiness/team/round rules. A rendered world is acknowledged only after launch.
 */
export function prototypeLobbyLifecycle(deps: {
  map: string; id(): number; send(event: ClientEvent): void; loaded(): void; fail(reason: string): void; now(): number;
}) {
  let lobby: Lobby | null = null, readyAt = 0, rendered = false, sentLoaded = false;
  let pending: { kind: 'ready' | 'team'; ready: boolean; team: string | null } | null = null;
  let launched = false, failure = '';
  const fail = (reason: string) => { if (!failure) { failure = reason; deps.fail(reason); } };
  const acknowledge = () => {
    if (rendered && launched && !sentLoaded && !failure) { sentLoaded = true; deps.loaded(); }
  };
  const own = () => lobby?.seats.find(s => s.id === deps.id());
  const available = () => !failure && rendered && !!own()?.team && !pending && !!lobby && !lobby.launched && lobby.countdown === null;
  return {
    fail,
    connection(state: 'connecting' | 'open' | 'closed' | 'refused', closeCode: number | null) {
      if (state === 'closed' || state === 'refused') fail(`Game connection ${state}${closeCode === null ? '' : ` (${closeCode})`}; reload to rejoin`);
    },
    event(event: ServerEvent) {
      if (failure || event.type !== 'gameLobby') return;
      if (event.nextMap) { fail('A map change requires a fresh experiment load'); return; }
      // The match ended and its game is back in its lobby on the same map (a map change is refused above): the loaded
      // world stays, a request from before the launch is void, and the next launch is acknowledged afresh.
      if (launched && !event.launched) { sentLoaded = false; pending = null; }
      // Borrow no network-owned arrays: the public report is safe to copy/edit.
      lobby = { ...event, seats: event.seats.map(seat => ({ ...seat })) };
      readyAt = deps.now() + (own()?.readyIn ?? 0) * 1000;
      const me = own();
      if (pending && (event.refused || event.launched || event.countdown !== null || !me?.team
        || (pending.kind === 'ready' ? me.ready !== pending.ready : me.team !== pending.team))) pending = null;
      launched = event.launched;
      acknowledge();
    },
    rendered() { rendered = true; acknowledge(); },
    ready(): boolean {
      if (!available() || deps.now() < readyAt) return false;
      const me = own()!; pending = { kind: 'ready', ready: me.ready, team: me.team };
      deps.send({ type: 'lobbyReady' }); return true;
    },
    switchTeams(): boolean {
      if (!available()) return false;
      const me = own()!; pending = { kind: 'team', ready: me.ready, team: me.team };
      deps.send({ type: 'switchTeams' }); return true;
    },
    report() {
      const me = own();
      return { launched, loaded: sentLoaded, ready: me?.ready ?? false, team: me?.team ?? null,
        readyIn: Math.max(0, Math.ceil((readyAt - deps.now()) / 1000)),
        canReady: available() && deps.now() >= readyAt, canSwitch: available(),
        countdown: lobby?.countdown ?? null, refused: lobby?.refused ?? '', error: failure,
        seats: lobby?.seats.map(({ name, team, ready }) => ({ name, team, ready })) ?? [] };
    },
  };
}
