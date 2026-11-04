/** Product adaptation: bounded in-memory native CLI MCP evidence; never model prose or a durable transcript. */
import type { Exchange } from './acceptance';
const TOOLS = ['agent_capabilities', 'agent_status', 'agent_pair', 'agent_request', 'agent_disconnect'];
export function nativeEventRecorder() {
  const events: Exchange[] = [], seen = new Set<string>(), pending = new Map<string, { name: string; arguments: any }>();
  let invalid = false, bytes = 0;
  const append = (id: unknown, name: string, args: any, result: any, error: boolean): void => {
    if (typeof id !== 'string' || !id || !args || typeof args !== 'object' || Array.isArray(args)) { invalid = true; return; }
    if (seen.has(id)) return;
    const exchange: Exchange = { method: 'tools/call', params: { name, arguments: args }, ...(error ? { error: true } : { result }) };
    bytes += Buffer.byteLength(JSON.stringify(exchange));
    if (events.length >= 512 || bytes > 24 * 1024 * 1024) { invalid = true; return; }
    seen.add(id); events.push(exchange);
  };
  return { events, invalid: () => invalid, beginInvocation(): void { seen.clear(); pending.clear(); }, consume(event: any): void {
    // Codex 0.162.1 wire shape, pinned official exec_events.rs:L261-L294:
    // https://github.com/openai/codex/blob/970111f6cb62cc02fe36a82ea7d71b37a2889c97/codex-rs/exec/src/exec_events.rs#L261
    const item = event?.item;
    if (event?.type === 'item.completed' && item?.type === 'mcp_tool_call' && item.server === 'socom2legacy' && TOOLS.includes(item.tool)) {
      append(item.id, item.tool, item.arguments, item.result && { content: item.result.content, structuredContent: item.result.structured_content },
        !!item.error || !item.result || item.status === 'failed');
    }
    const blocks = event?.message?.content;
    if (!Array.isArray(blocks)) return;
    if (event.type === 'assistant') for (const block of blocks) {
      const name = typeof block.name === 'string' ? block.name.replace(/^mcp__socom2legacy__/, '') : '';
      if (block.type !== 'tool_use' || block.name !== `mcp__socom2legacy__${name}` || !TOOLS.includes(name)) continue;
      if (typeof block.id !== 'string' || pending.has(block.id) || seen.has(block.id) || pending.size >= 512) { invalid = true; continue; }
      pending.set(block.id, { name, arguments: block.input });
    }
    if (event.type === 'user') for (const block of blocks) {
      if (block.type !== 'tool_result') continue;
      const call = pending.get(block.tool_use_id); if (!call) continue;
      pending.delete(block.tool_use_id);
      const content = typeof block.content === 'string' ? [{ type: 'text', text: block.content }] : (block.content ?? []).map((part: any) =>
        part.type === 'image' && part.source?.type === 'base64' ? { type: 'image', mimeType: part.source.media_type, data: part.source.data } : part);
      append(block.tool_use_id, call.name, call.arguments, { content, isError: block.is_error === true }, block.is_error === true);
    }
  } };
}
