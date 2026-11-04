import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { isUnexpectedToolEvent, killTree, launchChild } from './client';
import { withIsolatedProfile } from './isolation';

it('returns the real nonzero child result and flags structured child failures without retaining raw output', async () => {
  await withIsolatedProfile(async directory => {
    const result = await launchChild({ executable: process.execPath, args: ['-e', 'console.log(JSON.stringify({type:"error",message:"synthetic-secret"})); process.exitCode=7'],
      directory, env: process.env, prompt: '', timeoutMs: 5000 });
    expect(result).toMatchObject({ exitCode: 7, timedOut: false, outputError: true });
    expect(JSON.stringify(result)).not.toContain('synthetic-secret');
  });
});
it('kills a timed-out child and its descendants before cleaning the private profile', async () => {
  let location = '';
  await withIsolatedProfile(async directory => {
    location = directory;
    const marker = join(directory, 'alive');
    const grandchild = `require('node:fs').appendFileSync(${JSON.stringify(marker)},'.');setInterval(()=>require('node:fs').appendFileSync(${JSON.stringify(marker)},'.'),30)`;
    const script = join(directory, 'child.cjs');
    writeFileSync(script, `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});setInterval(()=>{},1000)`);
    const result = await launchChild({ executable: process.execPath, args: [script], directory, env: process.env, prompt: '', timeoutMs: 700 });
    expect(result.timedOut).toBe(true); expect(result.exitCode).not.toBe(0);
    expect(existsSync(marker)).toBe(true);
    const stopped = readFileSync(marker, 'utf8'); await delay(200);
    expect(readFileSync(marker, 'utf8')).toBe(stopped);
  });
  expect(existsSync(location)).toBe(false);
  // Budget includes the 700ms child deadline, taskkill's existing 10s bound, ACL setup and rm retries.
}, 30_000);
it('rejects observed builtin tools in either actual-client event shape', () => {
  for (const type of ['command_execution', 'file_change', 'web_search', 'collab_tool_call', 'future_unknown_tool']) {
    expect(isUnexpectedToolEvent({ type: 'item.started', item: { type } })).toBe(true);
  }
  expect(isUnexpectedToolEvent({ type: 'item.started', item: { type: 'mcp_tool_call', server: 'unrelated', tool: 'agent_request' } })).toBe(true);
  expect(isUnexpectedToolEvent({ type: 'item.started', item: { type: 'mcp_tool_call', server: 'socom2legacy', tool: 'agent_request' } })).toBe(false);
  expect(isUnexpectedToolEvent({ type: 'item.completed', item: { type: 'agent_message', text: 'normal response' } })).toBe(false);
  expect(isUnexpectedToolEvent({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } })).toBe(true);
  expect(isUnexpectedToolEvent({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__socom2legacy__agent_request' }] } })).toBe(false);
});
it('fails a synthetic child that emits a builtin event even if it would otherwise exit successfully', async () => {
  await withIsolatedProfile(async directory => {
    const result = await launchChild({ executable: process.execPath, args: ['-e', 'console.log(JSON.stringify({type:"item.completed",item:{type:"error",message:"synthetic warning"}}));console.log(JSON.stringify({type:"item.started",item:{type:"command_execution"}}))'],
      directory, env: process.env, prompt: '', timeoutMs: 5000 });
    expect(result.outputError).toBe(true);
    expect(result.clientEvents?.firstUnexpected).toEqual({ kind: 'COMMAND_EXECUTION' });
    expect(result.clientEvents?.warningEvents).toBe(1);
    expect(result.clientEvents?.jsonLines).toBeGreaterThan(0);
  });
});
it('keeps nonfatal Codex warning bookkeeping separate from later allowed MCP execution', async () => {
  await withIsolatedProfile(async directory => {
    const script = 'console.log(JSON.stringify({type:"item.completed",item:{type:"error",message:"synthetic warning"}}));console.log(JSON.stringify({type:"item.completed",item:{type:"mcp_tool_call",server:"socom2legacy",tool:"agent_capabilities"}}));';
    const result = await launchChild({ executable: process.execPath, args: ['-e', script], directory, env: process.env, prompt: '', timeoutMs: 5000 });
    expect(result.exitCode).toBe(0); expect(result.outputError).toBe(false); expect(result.nonMcpTool).toBeUndefined();
    expect(result.clientEvents?.warningEvents).toBe(1); expect(result.clientEvents?.unexpectedEvents).toBe(0);
    expect(isUnexpectedToolEvent({ type: 'item.completed', item: { type: 'error' } })).toBe(false);
  });
});
it('still fails a top-level fatal client error after warning bookkeeping', async () => {
  await withIsolatedProfile(async directory => {
    const script = 'console.log(JSON.stringify({type:"item.completed",item:{type:"error",message:"synthetic warning"}}));console.log(JSON.stringify({type:"turn.failed",error:{message:"synthetic fatal"}}));';
    const result = await launchChild({ executable: process.execPath, args: ['-e', script], directory, env: process.env, prompt: '', timeoutMs: 5000 });
    expect(result.outputError).toBe(true); expect(result.clientError).toBe(true); expect(result.nonMcpTool).toBeUndefined();
  });
});
it('delivers private interactive callback input and observes JSON events without retaining either', async () => {
  await withIsolatedProfile(async directory => {
    let observed = 0; const messages: string[] = [];
    const script = 'console.log("authorize-synthetic");process.stdin.once("data",b=>{console.log(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:String(b)}}));process.exit(0)})';
    const result = await launchChild({ executable: process.execPath, args: ['-e', script], directory, env: process.env, prompt: '', timeoutMs: 5000,
      dialogue: async line => line === 'authorize-synthetic' ? 'private-callback' : undefined, onEvent: () => { observed++; }, onMessage: message => { messages.push(message.text); } });
    expect(result.exitCode).toBe(0); expect(observed).toBe(1); expect(JSON.stringify(result)).not.toContain('private-callback');
    expect(messages.join()).toContain('private-callback');
  });
});

it('LATER 450: one process-tree kill serves the probe; ptyLogin and launchChild share it', () => {
  const sources = readdirSync(__dirname).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'));
  expect(sources.filter(name => readFileSync(join(__dirname, name), 'utf8').includes('taskkill'))).toEqual(['client.ts']);
  expect(sources.filter(name => /process\.kill\(-/.test(readFileSync(join(__dirname, name), 'utf8')))).toEqual(['client.ts']);
  expect(readFileSync(join(__dirname, 'ptyLogin.ts'), 'utf8')).toMatch(/import \{[^}]*\bkillTree\b[^}]*\} from '\.\/client'/);
});
it.skipIf(process.platform === 'win32')('LATER 450: the shared kill ends a POSIX process group and rejects for a group already gone', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
  const closed = new Promise(done => child.once('exit', done));
  await killTree(child.pid!); await closed;
  expect(child.signalCode).toBe('SIGKILL');
  await expect(killTree(child.pid!)).rejects.toThrow();
});
