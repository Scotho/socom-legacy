import WebSocket from 'ws';

// Owned test-server instrumentation only. Observe received goodbye frames without changing
// their payload, dispatch or the room's rules. DevTools may drop framesent events at navigation.
const emit = WebSocket.prototype.emit;
WebSocket.prototype.emit = function (event, ...args) {
  if (event === 'message' && args[1] !== true) {
    try {
      if (JSON.parse(String(args[0])).type === 'bye') process.stdout.write('{"xboxProbe":"bye-received"}\n');
    } catch { /* Other message formats are outside this probe. */ }
  }
  return Reflect.apply(emit, this, [event, ...args]);
};
