import { describe, expect, it } from 'vitest';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import type { ClientEvent, ServerEvent } from '../src/net/protocol';
import { SeatToldBoard } from '../src/net/seatTold';

/**
 * SVC-07c SEAT-TOLD (web sprint 18, W18.R3; research 264 §2; research 155 §2.3, §4.4): the page's end of the room's
 * `seatTold` -- each seat's last told rating and medal (the original's player state +8 and +0x42, refreshed from the
 * server's record after each round, `FUN_002c5360` D:L166200-166201, D:L166208-166209), kept for the screens (ONL-34 draws the medals),
 * replaced whole by each event, never by anything the page sends (research 169 §4: the page reports no result).
 */

function quietWalk(): NetWalk {
  return { setNetTap: () => undefined, respawn: () => true, nudge: () => undefined, setLocked: () => undefined };
}

/** A socket the test drives: `server(ev)` delivers an event as the server's text frame. */
function fakeSocket(): WebSocketLike & { server(ev: ServerEvent): void; sent: unknown[] } {
  const s = {
    binaryType: 'blob', readyState: 1, sent: [] as unknown[],
    send(data: string | Uint8Array) { s.sent.push(data); },
    close() { s.readyState = 3; s.onclose?.({ code: 1000, reason: '' }); },
    onopen: null as WebSocketLike['onopen'], onclose: null as WebSocketLike['onclose'],
    onmessage: null as WebSocketLike['onmessage'], onerror: null as WebSocketLike['onerror'],
    server(ev: ServerEvent) { s.onmessage?.({ data: JSON.stringify(ev) }); },
  };
  return s;
}

const told = (seats: { id: number; rating: number; medal: number }[]): ServerEvent => ({ type: 'seatTold', seats } as ServerEvent);

describe('SVC-07c: the net client keeps each seat\'s last told rating and medal', () => {
  it('the event fills the board; a second replaces it whole; another event, or anything the page sends, changes nothing', () => {
    const socket = fakeSocket();
    const client = new NetClient({ url: 'mem', map: 'MP72', name: 'A', socket: () => socket }, quietWalk());
    socket.onopen?.({});
    const board = new SeatToldBoard(client);
    expect(board.all().size).toBe(0);
    expect(board.get(1)).toBeUndefined();

    socket.server(told([{ id: 1, rating: 1003, medal: 5 }, { id: 2, rating: 997, medal: 5 }]));
    expect(board.get(1)).toEqual({ rating: 1003, medal: 5 });
    expect(board.get(2)).toEqual({ rating: 997, medal: 5 });
    expect([...board.all()]).toEqual([[1, { rating: 1003, medal: 5 }], [2, { rating: 997, medal: 5 }]]);

    socket.server(told([{ id: 2, rating: 990, medal: 4 }, { id: 3, rating: 1012, medal: 3 }]));
    expect([...board.all()]).toEqual([[2, { rating: 990, medal: 4 }], [3, { rating: 1012, medal: 3 }]]);
    expect(board.get(1)).toBeUndefined();

    // The page's own messages, a forged one among them, and another server event: the board as the room last told it.
    client.send({ type: 'ping', t: 1 });
    client.send({ type: 'seatTold', seats: [{ id: 2, rating: 9999, medal: 5 }] } as unknown as ClientEvent);
    socket.server({ type: 'pong', t: 1, tick: 0 });
    socket.server({ type: 'kicked', reason: 'idle' });
    expect([...board.all()]).toEqual([[2, { rating: 990, medal: 4 }], [3, { rating: 1012, medal: 3 }]]);

    // The view is a copy: a screen that writes into it changes nothing kept.
    (board.all() as Map<number, unknown>).clear();
    (board.get(2) as { rating: number }).rating = 1;
    expect(board.get(2)).toEqual({ rating: 990, medal: 4 });

    // A malformed entry is dropped, the rest kept; after `close` nothing more is heard.
    socket.server({ type: 'seatTold', seats: [{ id: 4, rating: 1000, medal: 2 }, { id: 'x', rating: 1, medal: 1 }, { id: 5, rating: null, medal: 1 }] } as unknown as ServerEvent);
    expect([...board.all()]).toEqual([[4, { rating: 1000, medal: 2 }]]);
    board.close();
    socket.server(told([{ id: 6, rating: 1001, medal: 1 }]));
    expect([...board.all()]).toEqual([[4, { rating: 1000, medal: 2 }]]);
  });

  it("the page's NetClient holds its own board (`client.told`), filled by the room's event and closed with the client", () => {
    const socket = fakeSocket();
    const client = new NetClient({ url: 'mem', map: 'MP72', name: 'A', socket: () => socket }, quietWalk());
    socket.onopen?.({});
    expect(client.told).toBeInstanceOf(SeatToldBoard);
    expect(client.told.get(3)).toBeUndefined();
    socket.server(told([{ id: 3, rating: 1012, medal: 3 }, { id: 4, rating: 988, medal: 1 }]));
    expect(client.told.get(3)).toEqual({ rating: 1012, medal: 3 });
    expect(client.told.get(4)).toEqual({ rating: 988, medal: 1 });
    client.send({ type: 'seatTold', seats: [{ id: 3, rating: 9999, medal: 5 }] } as unknown as ClientEvent);
    expect(client.told.get(3)).toEqual({ rating: 1012, medal: 3 });
    client.close();
    socket.server(told([{ id: 3, rating: 1, medal: 1 }]));          // a late frame after the page's close: not heard
    expect(client.told.get(3)).toEqual({ rating: 1012, medal: 3 });  // the last values stay readable
  });
});
