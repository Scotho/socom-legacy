// SA-7a's tell-window test (`../matchTellWindow.test.ts`): a child process at the far end of a real IPC channel -- the
// supervisor's seat -- answering each message it is sent with the message itself, so a tell crosses the pipe both ways.
process.on('message', (m) => { process.send(m); });
process.on('disconnect', () => process.exit(0));
