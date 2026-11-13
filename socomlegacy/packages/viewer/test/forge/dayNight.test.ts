// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { emptyLayout, parseLayout, serializeLayout, settingsOf, DEFAULT_SETTINGS } from '../../src/forge/layout';
import { recordOfLayout, layoutOfRecord, checkRecord } from '../../src/forge/record';
import { planForgeLayout } from '../../src/forge/agent/commands';
import { History, recordEdit, encodeHistoryStep, decodeHistoryStep } from '../../src/forge/history';
import { matchBrightenOf, stepSetting } from '../../src/forge/settings';
import { buildSettings, formatSetting, MAP_SETTING_ROWS, settingsMenuSection, type SettingsMenuHooks } from '../../src/forge/panels/settingsPanel';
import { legendFor } from '../../src/forge/shell/legend';

describe('saved Forge day/night adaptation', () => {
  const layout = () => ({ ...emptyLayout({ kind: 'blank', library: 'floor' }), name: 'Lighting' });
  it('defaults to Original, keeping old dimmer files intact', () => {
    expect(settingsOf(layout()).timeOfDay).toBeNull();
    const old = { ...layout(), settings: { light: 0.4 } };
    expect(settingsOf(parseLayout(serializeLayout(old)))).toMatchObject({ light: 0.4, timeOfDay: null });
    expect(matchBrightenOf(settingsOf(old))).toBeLessThan(0);
    expect(matchBrightenOf({ ...DEFAULT_SETTINGS, light: 0.4, timeOfDay: 0.8 })).toBeUndefined();
  });
  it('round trips recipes, records, agent edits and undo without a second schema', () => {
    for (const timeOfDay of [null, 0, 0.38, 1]) {
      const before = serializeLayout(layout());
      const edited = planForgeLayout(layout(), 'settings.set', { settings: { timeOfDay } }, []);
      expect(settingsOf(parseLayout(serializeLayout(edited))).timeOfDay).toBe(timeOfDay);
      const record = recordOfLayout(edited, 'Lighting');
      expect(checkRecord(record)).toBeNull();
      expect(settingsOf(layoutOfRecord(record)).timeOfDay).toBe(timeOfDay);
      const history = new History(encodeHistoryStep(before, []));
      recordEdit(history, serializeLayout(edited), [], []);
      if (timeOfDay !== null) expect(decodeHistoryStep(history.undo()!).text).toBe(before);
    }
  });
  it('rejects nonfinite, nonnumeric and out of range time throughout validation', () => {
    for (const timeOfDay of [-0.01, 1.01, '0.5', true, {}, NaN, Infinity]) {
      // NaN/Infinity cannot appear as JSON numbers; check the record object before serialization too.
      expect(() => planForgeLayout(layout(), 'settings.set', { settings: { timeOfDay } }, [])).toThrow();
      expect(checkRecord({ ...recordOfLayout(layout(), 'Lighting'), settings: { timeOfDay } })).not.toBeNull();
    }
  });
  it('steps nullable time from Day and clears the legacy dimmer on new edits', () => {
    expect(stepSetting({ ...DEFAULT_SETTINGS, light: 0.4 }, 'timeOfDay', -1, 4000)).toMatchObject({ timeOfDay: 0.95, light: 1 });
    expect(stepSetting({ ...DEFAULT_SETTINGS, timeOfDay: 0 }, 'timeOfDay', -1, 4000).timeOfDay).toBe(0);
    expect(stepSetting({ ...DEFAULT_SETTINGS, timeOfDay: 1 }, 'timeOfDay', 1, 4000).timeOfDay).toBe(1);
  });
  it('lives in the Settings panel and its START menu section (#520\'s one row list): Night -> Day slider, Original, label', () => {
    const row = MAP_SETTING_ROWS.find((r) => r.control === 'range')!;
    expect(row).toMatchObject({ id: 'timeOfDay', menuId: 'setting-timeOfDay', label: 'Night / day', menuAct: 'original' });
    expect(formatSetting('timeOfDay', DEFAULT_SETTINGS, 4000)).toBe('Original');
    expect(formatSetting('timeOfDay', { ...DEFAULT_SETTINGS, timeOfDay: 0.25 }, 4000)).toBe('25%');
    expect(formatSetting('timeOfDay', { ...DEFAULT_SETTINGS, light: 0.4 }, 4000)).toBe('40% · legacy brightness');
    const dom = buildSettings(document);
    expect(dom.lightIn.getAttribute('aria-label')).toBe('Night to day');
    expect([dom.lightIn.min, dom.lightIn.max, dom.lightIn.step]).toEqual(['0', '1', '0.05']);
    expect(dom.lightReset.textContent).toBe('Original');
    // The layout's lighting rows are the Environment panel's (built here, mounted there): not in Settings' own body.
    expect(dom.lightingRows.some((r) => r.contains(dom.lightControls)) && dom.lightControls.contains(dom.lightIn) && dom.lightControls.contains(dom.lightReset)).toBe(true);
    expect(dom.lightingRows.some((r) => r.contains(dom.fogIn))).toBe(true);
    expect(dom.body.contains(dom.lightControls) || dom.body.contains(dom.fogIn)).toBe(false);
    const calls: string[] = [];
    let locked = false;
    const hooks: SettingsMenuHooks = {
      settings: () => ({ ...DEFAULT_SETTINGS, timeOfDay: 0.5 }), discFar: () => 4000, gameTypeLabel: () => 'Map’s own', cycleGameType: () => {},
      step: (key, dir) => calls.push(`step ${key} ${dir}`), resetFog: () => calls.push('fog'), resetLighting: () => calls.push('original'), locked: () => locked,
    };
    const item = settingsMenuSection(hooks).find((i) => i.id === 'setting-timeOfDay')!;
    expect(item).toMatchObject({ label: 'Night / day', value: '50%', note: '← → Night to Day · ✕ Original' });
    expect(item.disabled).toBeUndefined();
    item.left!(); item.right!(); item.act!();
    expect(calls).toEqual(['step timeOfDay -1', 'step timeOfDay 1', 'original']);
    locked = true;
    expect(settingsMenuSection(hooks).find((i) => i.id === 'setting-timeOfDay')!.disabled).toBe(true);
  });
  it('the legend always assigns look to a right drag', () => {
    const words = (tool = 'select') => legendFor({ kind: 'build', tool, selection: 0 }, 'keys').map((p) => [p.key, p.label]);
    expect(words()).toEqual([['Click', 'Select'], ['Shift+click', 'Add'], ['Shift+drag', 'Box'], ['Right-drag', 'Look'], ['WASD', 'Fly'], ['F', 'Frame'], ['M', 'Menu']]);
    expect(words('place')).toContainEqual(['Right-drag', 'Look']);
  });
});
