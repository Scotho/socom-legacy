import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { launchPtyLogin, type PtyFactory } from './ptyLogin';
import { authorizationFromLine } from './nativeOAuth';
function terminalFixture(timeout = false) {
  let data: (value: string) => void = () => {}, exit: (value: { exitCode: number }) => void = () => {};
  let killed = 0, disposed = 0; const writes: string[] = [];
  const factory: PtyFactory = { spawn: () => {
    queueMicrotask(() => data('\u001b[32mAuthorization synthetic\u001b[0m\r\n'));
    return { pid: 123, onData: callback => { data = callback; return { dispose: () => { disposed++; } }; },
      onExit: callback => { exit = callback; return { dispose: () => { disposed++; } }; },
      write: value => { writes.push(value); if (!timeout) queueMicrotask(() => exit({ exitCode: 0 })); },
      kill: () => { killed++; queueMicrotask(() => exit({ exitCode: 1 })); } };
  } };
  return { factory, writes, killed: () => killed, disposed: () => disposed };
}
const options = { executable: 'synthetic-claude', args: ['mcp', 'login', '--no-browser', 'socom2legacy'], directory: '.', env: {}, prompt: '', timeoutMs: 1000 };
it('uses a real terminal seam only for the fixed login command and returns no terminal transcript', async () => {
  const fixture = terminalFixture();
  const result = await launchPtyLogin({ ...options, dialogue: async line => line === 'Authorization synthetic' ? 'private-callback' : undefined }, fixture.factory);
  expect(result).toMatchObject({ exitCode: 0, timedOut: false, outputError: false });
  expect(fixture.writes).toEqual(['private-callback\r']); expect(fixture.disposed()).toBe(2);
  expect(fixture.killed()).toBe(0);
  expect(JSON.stringify(result)).not.toContain('private-callback');
  await expect(launchPtyLogin({ ...options, args: ['--print', 'not-authorized'] }, fixture.factory)).rejects.toThrow('PTY_LOGIN_COMMAND_REQUIRED');
});
it('kills and disposes the owned terminal on timeout or private dialogue failure', async () => {
  for (const failure of [false, true]) {
    const fixture = terminalFixture(true);
    const result = await launchPtyLogin({ ...options, timeoutMs: 20, dialogue: async () => { if (failure) throw Error('private-error'); return undefined; } }, fixture.factory,
      async () => {});
    expect(fixture.killed()).toBeGreaterThan(0); expect(fixture.disposed()).toBe(2);
    expect(failure ? result.outputError : result.timedOut).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private-error');
  }
});

// Offline candidate: standard OSC 8 fixtures do not assert that the installed CLI emits hyperlinks.
const oscGateway = 'http://127.0.0.1:5368';
const oscVerifier = 'offline-pkce-verifier-for-unit-tests-only-0123456789';
const oscChallenge = createHash('sha256').update(oscVerifier).digest('base64url');
const oscAuthorization = `${oscGateway}/authorize?response_type=code&redirect_uri=${encodeURIComponent('http://127.0.0.1:54321/callback')}&code_challenge=${oscChallenge}&code_challenge_method=S256&state=offline%2fopaque%2B%27%29%2c%2e&resource=${encodeURIComponent(`${oscGateway}/mcp`)}`;
const oscLink = (target: string, label: string, end: string) => `\u001b]8;;${target}${end}${label}\u001b]8;;${end}`;
const oscCases = [
  { label: 'plain URI', chunks: [`Open ${oscAuthorization}\r\n`] },
  { label: 'CSI color only', chunks: [`\u001b[32mOpen ${oscAuthorization}\u001b[0m\r\n`] },
  { label: 'plain URI and CRLF split across chunks', chunks: ['Open ' + oscAuthorization.slice(0, 41), oscAuthorization.slice(41) + '\r', '\n'] },
  ...[{ name: 'ST', end: '\u001b\\' }, { name: 'BEL', end: '\u0007' }].flatMap(({ name, end }) => {
    const link = oscLink(oscAuthorization, 'Authorize', end);
    return [
      { label: `OSC 8 ${name} with a non-URI label`, chunks: [`Open ${link}\r\n`] },
      // These are transport chunk boundaries, not terminal screen rows; no row-joining behavior is requested.
      { label: `OSC 8 ${name} split inside introducer, target and terminator`, chunks: [link.slice(0, 1), link.slice(1, 41), link.slice(41, -1), link.slice(-1), '\r', '\n'] },
      { label: `OSC 8 ${name} with a different visible URI`, chunks: [`${oscLink(oscAuthorization, oscAuthorization + 'VISIBLE_ONLY', end)}\r\n`] },
    ];
  }),
];
function chunkedTerminalFixture(chunks: string[]) {
  let data: (value: string) => void = () => {}, exit: (value: { exitCode: number }) => void = () => {};
  const writes: string[] = [];
  const factory: PtyFactory = { spawn: () => {
    queueMicrotask(() => { for (const chunk of chunks) data(chunk); setImmediate(() => exit({ exitCode: 0 })); });
    return { pid: 123,
      onData: callback => { data = callback; return { dispose: () => {} }; },
      onExit: callback => { exit = callback; return { dispose: () => {} }; },
      write: value => { writes.push(value); },
      kill: () => { queueMicrotask(() => exit({ exitCode: 1 })); },
    };
  } };
  return { factory, writes };
}
it.each(oscCases)('preserves the authorization target through terminal dialogue: $label', async ({ chunks }) => {
  const fixture = chunkedTerminalFixture(chunks), observed: URL[] = [];
  const result = await launchPtyLogin({ ...options, dialogue: async line => {
    const parsed = authorizationFromLine(line, oscGateway);
    if (parsed) observed.push(parsed);
    return undefined;
  } }, fixture.factory, async () => {}); // In-memory terminal: never invoke OS process termination.
  expect(result).toMatchObject({ exitCode: 0, timedOut: false, outputError: false });
  expect(observed).toHaveLength(1);
  expect(observed[0]?.href).toBe(new URL(oscAuthorization).href);
  expect(observed[0]?.search).toBe(new URL(oscAuthorization).search);
  expect(observed[0]?.searchParams.get('resource')).toBe(`${oscGateway}/mcp`);
  expect(fixture.writes).toEqual([]);
  expect(JSON.stringify(result)).not.toContain('offline');
});
it.each(['\u001b\\', '\u0007'])('refuses an invalid OSC 8 target before VT stripping can expose a trusted label (%j)', async end => {
  const fixture = chunkedTerminalFixture([`${oscLink('javascript:' + oscAuthorization, oscAuthorization, end)}\r\n`]);
  const observed: URL[] = [];
  const result = await launchPtyLogin({ ...options, dialogue: async line => {
    const parsed = authorizationFromLine(line, oscGateway);
    if (parsed) observed.push(parsed);
    return undefined;
  } }, fixture.factory, async () => {});
  expect(result.outputError).toBe(true);
  expect(observed).toEqual([]);
  expect(fixture.writes).toEqual([]);
});
it.each(['\u001b\\', '\u0007'])('refuses a C1 CSI inside the OSC 8 target before presentation stripping can change query data (%j)', async end => {
  const target = oscAuthorization + '&opaque=\u009b31mdata';
  const fixture = chunkedTerminalFixture([`${oscLink(target, 'Authorize', end)}\r\n`]);
  const observed: URL[] = [];
  const result = await launchPtyLogin({ ...options, dialogue: async line => {
    const parsed = authorizationFromLine(line, oscGateway);
    if (parsed) observed.push(parsed);
    return undefined;
  } }, fixture.factory, async () => {});
  expect(result.outputError).toBe(true);
  expect(observed).toEqual([]);
  expect(fixture.writes).toEqual([]);
});
it.each(['\u001b\\', '\u0007'])('refuses a malformed OSC 8 opener before presentation stripping exposes its trusted label (%j)', async end => {
  const malformed = `\u001b]8;;not-a-url\u001b[31m${end}${oscAuthorization}\u001b]8;;${end}`;
  const fixture = chunkedTerminalFixture([malformed + '\r\n']);
  const observed: URL[] = [];
  const result = await launchPtyLogin({ ...options, dialogue: async line => {
    const parsed = authorizationFromLine(line, oscGateway);
    if (parsed) observed.push(parsed);
    return undefined;
  } }, fixture.factory, async () => {});
  expect(result.outputError).toBe(true);
  expect(observed).toEqual([]);
  expect(fixture.writes).toEqual([]);
});
it('ignores unrelated status hyperlinks before authorization, including non-http and unfinished status frames', async () => {
  const fixture = chunkedTerminalFixture([
    oscLink('file:///offline/log.txt', 'Open log', '\u0007') + '\r\n',
    oscLink('mailto:offline@example.invalid', 'Help', '\u001b\\') + '\r\n',
    '\u001b]8;;unfinished-status-link\r\n',
    oscLink(oscAuthorization, 'Authorize', '\u001b\\') + '\r\n',
  ]);
  const observed: URL[] = [];
  const result = await launchPtyLogin({ ...options, dialogue: async line => {
    // The installed-client dialogue ignores status URLs before parsing authorization, nativeClient.ts.
    if (!line.includes('redirect_uri=')) return undefined;
    const parsed = authorizationFromLine(line, oscGateway);
    if (parsed) observed.push(parsed);
    return undefined;
  } }, fixture.factory, async () => {});
  expect(result).toMatchObject({ exitCode: 0, timedOut: false, outputError: false });
  expect(observed.map(url => url.href)).toEqual([new URL(oscAuthorization).href]);
  expect(fixture.writes).toEqual([]);
});
it.each(['\u001b\\', '\u0007'])('preserves the authorization target after a docs hyperlink through the PTY (%j)', async end => {
  const fixture = chunkedTerminalFixture([`${oscLink('https://docs.invalid/help', 'Help', end)} ${oscLink(oscAuthorization, 'Authorize', end)}\r\n`]);
  const observed: URL[] = [];
  const result = await launchPtyLogin({ ...options, dialogue: async line => {
    if (!line.includes('redirect_uri=')) return undefined;
    const parsed = authorizationFromLine(line, oscGateway);
    if (parsed) observed.push(parsed);
    return undefined;
  } }, fixture.factory, async () => {});
  expect(result).toMatchObject({ exitCode: 0, timedOut: false, outputError: false });
  expect(observed.map(url => url.href)).toEqual([new URL(oscAuthorization).href]);
});
it.each(['\u001b\\', '\u0007'].flatMap(end => ['\u001b[0m', '\u009b0m'].map(control => ({ end, control }))))(
  'never authorizes a visible label reconstructed by stripping terminal controls (%j)', async ({ end, control }) => {
    const label = oscAuthorization.replace('redirect_uri=', `redirect_${control}uri=`);
    const raw = oscLink('javascript:void(0)', label, end);
    expect(raw.includes('redirect_uri=')).toBe(false);
    const fixture = chunkedTerminalFixture([raw + '\r\n']), observed: URL[] = [];
    await launchPtyLogin({ ...options, dialogue: async line => {
      // Match the post-PTY installed-client filter: direct parsing of raw text alone misses this interaction.
      if (!line.includes('redirect_uri=')) return undefined;
      const parsed = authorizationFromLine(line, oscGateway);
      if (parsed) { observed.push(parsed); return 'offline-callback-must-not-be-written'; }
      return undefined;
    } }, fixture.factory, async () => {});
    expect(observed).toEqual([]);
    expect(fixture.writes).toEqual([]);
  });

// LATER 449: a terminal that outlives its first kill still holds the client profile, so the login must not settle
// (and let withIsolatedProfile remove the profile) until the owned tree's termination is confirmed.
function stubbornTerminal() {
  let exit: (value: { exitCode: number }) => void = () => {};
  const factory: PtyFactory = { spawn: () => ({ pid: 456, onData: () => ({ dispose: () => {} }),
    onExit: callback => { exit = callback; return { dispose: () => {} }; }, write: () => {}, kill: () => {} }) };
  return { factory, exit: (code: number) => exit({ exitCode: code }) };
}
it('LATER 449: retries a failed kill and settles only once the owned tree is confirmed gone', async () => {
  const fixture = stubbornTerminal(); let attempts = 0, confirmedAt = 0;
  const result = await launchPtyLogin({ ...options, timeoutMs: 20 }, fixture.factory, async () => {
    attempts++; if (attempts === 1) throw Error('synthetic kill failure');
    confirmedAt = Date.now(); queueMicrotask(() => fixture.exit(1));
  });
  const settledAt = Date.now();
  expect(attempts).toBe(2); expect(confirmedAt).toBeGreaterThan(0); expect(settledAt).toBeGreaterThanOrEqual(confirmedAt);
  expect(result).toMatchObject({ timedOut: true, outputError: true });
}, 30_000);
it('LATER 449: refuses to settle as released when no kill of the owned tree is ever confirmed', async () => {
  const fixture = stubbornTerminal(); let attempts = 0;
  await expect(launchPtyLogin({ ...options, timeoutMs: 20 }, fixture.factory, async () => { attempts++; throw Error('synthetic kill failure'); }))
    .rejects.toThrow('NATIVE_PTY_TERMINATION_UNCONFIRMED');
  expect(attempts).toBeGreaterThan(1);
}, 30_000);
