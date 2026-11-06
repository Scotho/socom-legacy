// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildInspector, dataRows, showInspectorData } from '../../src/forge/panels/inspectorPanel';
import { mapDataGroups } from '../../src/forge/mapData';
import { billboardSpecs } from '../../src/forge/mapDataBillboards';

/**
 * The Inspector's Data (a browser adaptation, FG.R2): every field of the selected object's own record, read only,
 * under its transform -- a map data item's as the disc gives it, a placement's as the editor keeps it.
 */
describe('the Inspector data', () => {
  it('flattens a record into named rows: nested by dots, a list of numbers on one line, numbers to three places', () => {
    expect(dataRows({ name: 'Safety', kind: 1, rect: { minX: 1.23456, maxX: 2 }, at: [1, 2.5, 3], sites: [{ team: 0 }], on: true, gone: undefined, f: () => 0 }))
      .toEqual([['name', 'Safety'], ['kind', '1'], ['rect.minX', '1.235'], ['rect.maxX', '2'], ['at', '[1, 2.5, 3]'], ['sites.0.team', '0'], ['on', 'true']]);
    expect(dataRows(null)).toEqual([]);
  });

  it('shows the rows under the transform, hidden with none', () => {
    const dom = buildInspector(document);
    expect(dom.body.contains(dom.data)).toBe(true);
    expect([...dom.body.children].indexOf(dom.data)).toBeGreaterThan([...dom.body.children].indexOf(dom.fields));
    showInspectorData(dom, [['name', 'Safety'], ['kind', '1 (EXTRACT_ZONE)']]);
    expect(dom.data.hidden).toBe(false);
    expect([...dom.data.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['name', 'kind']);
    expect([...dom.data.querySelectorAll('dd')].map((d) => d.textContent)).toEqual(['Safety', '1 (EXTRACT_ZONE)']);
    showInspectorData(dom, []);
    expect(dom.data.hidden).toBe(true);
  });

  it('an editable field is an input above the read-only rows, the rows it covers left out; a change commits it', () => {
    const dom = buildInspector(document);
    const set: unknown[] = [];
    showInspectorData(dom, [['zone.name', 'Safety'], ['zone.w', '100'], ['id', 'zone_1']], [
      { label: 'Name', kind: 'text', value: 'Safety', covers: ['zone.name'], set: (v) => set.push(v) },
      { label: 'Width', kind: 'number', value: 100, covers: ['zone.w'], set: (v) => set.push(v) },
      { label: 'Team', kind: 'select', value: 'A', options: [['A', 'SEAL'], ['B', 'Terrorist']], set: (v) => set.push(v) },
      { label: 'Locked', kind: 'check', value: false, set: (v) => set.push(v) },
    ]);
    expect([...dom.data.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['Name', 'Width', 'Team', 'Locked', 'id']);
    const [name, width, team, locked] = [...dom.data.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')];
    (width as HTMLInputElement).value = '240'; width!.dispatchEvent(new Event('change'));
    name!.value = 'Safety2'; name!.dispatchEvent(new Event('change'));
    team!.value = 'B'; team!.dispatchEvent(new Event('change'));
    (locked as HTMLInputElement).checked = true; locked!.dispatchEvent(new Event('change'));
    expect(set).toEqual([240, 'Safety2', 'B', true]);
  });

  it('a choice made redraws its dependants at once, the choice kept focused; a field being typed in is left alone', () => {
    const dom = buildInspector(document);
    document.body.append(dom.data);
    const editors = (map: string, door: string) => [
      { label: 'Map', kind: 'select' as const, value: map, options: [['MP2', 'MP2'], ['MP73', 'MP73']] as const, set: () => {} },
      { label: 'Door', kind: 'select' as const, value: door, options: [['bdoor_4', 'bdoor_4'], ['door_ft1', 'door_ft1']] as const, set: () => {} },
      { label: 'Name', kind: 'text' as const, value: 'x', set: () => {} },
    ];
    showInspectorData(dom, [], editors('MP2', 'bdoor_4'));
    dom.data.querySelector<HTMLSelectElement>('select')!.focus();
    showInspectorData(dom, [], editors('MP73', 'door_ft1'));       // the Map changed while focused: its door follows
    const [map, door] = [...dom.data.querySelectorAll('select')];
    expect([map!.value, door!.value]).toEqual(['MP73', 'door_ft1']);
    expect(document.activeElement).toBe(map);                       // the focus kept on the choice
    dom.data.querySelector<HTMLInputElement>('input')!.focus();
    showInspectorData(dom, [], editors('MP2', 'bdoor_4'));         // typing in Name: not redrawn under it
    expect(dom.data.querySelector('select')!.value).toBe('MP73');
    dom.data.remove();
  });

  it('a map data item carries its own record to the Inspector: a tactical zone its rectangle and its kind named', () => {
    const groups = mapDataGroups({ tac: { points: [], zones: [{ name: 'Safety', kind: 1, minX: 0, minZ: 0, maxX: 10, maxZ: 20 }] } }, () => 0);
    const spec = billboardSpecs(groups, [])[0]!;
    expect(spec.data).toMatchObject({ name: 'Safety', kind: 1, kindName: 'EXTRACT_ZONE', minX: 0, maxZ: 20 });
  });
});
