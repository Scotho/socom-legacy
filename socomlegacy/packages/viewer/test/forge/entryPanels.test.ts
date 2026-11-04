// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { LocalPackApi } from '../../src/agent/localPacks';
import type { ForgeAgentApi } from '../../src/forge/agent/api';
import type { ForgePageServices, ForgePanelSource } from '../../src/forge/page';
import { createForgeShell, PANELS_MENU_HEADING } from '../../src/forge/shell/panel';

/**
 * FUI-1's fix-up (A5; FUI.R3: the agent dock ships in release, pad-reachable; a browser adaptation, FG.R2): the Forge's
 * page loader (`pageEntry.ts` `PAGE_LOADERS.forge`, every build) hands the page the agent dock as a registered panel,
 * with a pad path -- so a release build cannot lose it, or its START row, without this failing. The page itself is
 * replaced: what is pinned is what the loader passes it.
 */
type Handed = readonly ForgePanelSource[];
const mountForge = vi.hoisted(() => vi.fn(async (_doc: Document, _options?: { panels?: Handed }) => undefined));
vi.mock('../../src/forge/page', () => ({ mountForge }));

describe('the Forge page loader: the panels it hands the page (FUI-1 A5, FUI.R3)', () => {
  it('passes the agent dock -- right dock, after Settings, folded -- with its START row, which the shell lists under Panels', async () => {
    const { PAGE_LOADERS } = await import('../../src/pageEntry');
    expect(PAGE_LOADERS.forge, 'the forge loader is in every build (FG.R9)').toBeTypeOf('function');
    const loaded = await PAGE_LOADERS.forge!();
    await loaded.mountForge(document);
    expect(mountForge).toHaveBeenCalledTimes(1);
    const [doc, options] = mountForge.mock.calls[0]!;
    expect(doc).toBe(document);
    // R4: the agent dock is made from the page's services (its one local packs instance), not with packs of its own
    const sources = options?.panels ?? [];
    expect(sources.some((p) => typeof p === 'function'), 'the dock is made from the page\'s services').toBe(true);
    const services: ForgePageServices = { packs: { stage: vi.fn() } as unknown as LocalPackApi };
    const panels = await Promise.all(sources.map((p) => (typeof p === 'function' ? p(services) : p)));
    const agent = panels.find((p) => p.id === 'agent');
    expect(agent, 'the agent dock is handed to the page').toBeDefined();
    expect(agent).toMatchObject({ title: 'Connect your agent', dock: 'right', defaultOpen: false, tab: 'Agent' });
    expect(agent!.order).toBeGreaterThan(40);                      // after Settings (40)
    // Its pad path: its own START row (a menu section), which shows it.
    expect(agent!.menuSection, 'the agent dock declares its START section').toBeTypeOf('function');
    const row = agent!.menuSection!().find((r) => r.id === 'panel-agent');
    expect(row).toMatchObject({ label: 'Connect your agent' });
    expect(row!.act).toBeTypeOf('function');
    // Registered (its body stubbed: the connection is the agent's own tests'), the shell lists that row under Panels.
    const right = document.createElement('aside');
    document.body.append(right);
    const data = new Map<string, string>();
    const shell = createForgeShell({ doc: document, docks: { right }, storeKey: 'k',
      store: { get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } },
      context: { get forge(): ForgeAgentApi { throw new Error('no facade'); }, doc: document, store: { get: () => null, set: () => undefined },
        ui: { notify: () => undefined, toast: () => undefined, reveal: (id) => shell.reveal(id), collapse: (id) => shell.collapse(id) },
        state: () => ({ surface: 'build', canEdit: true, canPlace: true, reason: null, revision: 0 }) } });
    shell.register({ ...agent!, mount: () => ({ dispose: () => undefined }) });
    const items = shell.menuItems();
    const heading = items.findIndex((r) => r.heading && r.label === PANELS_MENU_HEADING);
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(items.slice(heading + 1).find((r) => r.id === 'panel-agent')).toMatchObject({ label: 'Connect your agent' });
    shell.dispose();
  });
});
