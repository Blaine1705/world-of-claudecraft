import { describe, expect, it, vi } from 'vitest';
import { QUESTS, WORLD_QUESTS } from '../src/sim/data';
import type { QuestProgress, WorldQuestProgress } from '../src/sim/types';
import { QuestTrackerController } from '../src/ui/hud/quest/quest_tracker_controller';
import { makeWriterFacet } from '../src/ui/painter_host';
import { dropPointerFocus } from '../src/ui/pointer_blur';

/** A private facet per rig: the controller takes Hud's shared one in production,
 *  and a test needs only the elision behaviour. */
function writers() {
  return makeWriterFacet(
    new Map(),
    new Map(),
    new Map(),
    new Map(),
    () => {},
    () => {},
  );
}

function progress(questId: string, state: QuestProgress['state'] = 'active'): QuestProgress {
  return {
    questId,
    state,
    counts: QUESTS[questId].objectives.map((objective, index) =>
      index === 0 ? objective.count : 0,
    ),
  };
}

function harness(entries: QuestProgress[] = [], worldEntries: WorldQuestProgress[] = []) {
  const questLog = new Map(entries.map((entry) => [entry.questId, entry]));
  const worldQuestLog = new Map(worldEntries.map((entry) => [entry.questId, entry]));
  let html = '';
  let writes = 0;
  let collapsed = false;
  const listeners = new Map<string, EventListener>();
  const header = {
    classList: { contains: (value: string) => value === 'qt-header' },
    focus: vi.fn(),
    // A real blur moves document focus to the body; the fake document mirrors that.
    blur: vi.fn(() => {
      docState.activeElement = null;
    }),
  };
  const docState: { activeElement: unknown } = { activeElement: header };
  const element = {
    get innerHTML() {
      return html;
    },
    set innerHTML(value: string) {
      html = value;
      writes++;
    },
    addEventListener: (type: string, listener: EventListener) => {
      listeners.set(type, listener);
    },
    querySelector: (selector: string) => (selector === '.qt-header' ? header : null),
  } as unknown as HTMLElement;
  const document = docState as unknown as Document;
  const settings = {
    available: vi.fn(() => true),
    collapsed: vi.fn(() => collapsed),
    setCollapsed: vi.fn((next: boolean) => {
      collapsed = next;
    }),
  };
  const click = vi.fn();
  const openQuest = vi.fn();
  const controller = new QuestTrackerController({
    writers: writers(),
    element,
    document,
    world: () => ({ questLog, worldQuestLog }),
    settings,
    questTitle: (questId) => `title:${questId}`,
    objectiveLabel: (questId, index) => `objective:${questId}:${index}`,
    openQuest,
    click,
  });
  return {
    controller,
    questLog,
    worldQuestLog,
    settings,
    click,
    openQuest,
    header,
    html: () => html,
    writes: () => writes,
    setCollapsed: (next: boolean) => {
      collapsed = next;
    },
    collapsed: () => collapsed,
    dispatch: (type: string, event: unknown) => listeners.get(type)?.(event as Event),
  };
}

describe('QuestTrackerController', () => {
  it('shows authoritative movement instructions even when collapsed without changing the preference', () => {
    const questId = 'wq_eastbrook_calligraphy';
    const entry: WorldQuestProgress = {
      questId,
      state: 'active',
      count: 0,
      tracing: {
        questId,
        shapeIndex: 0,
        phase: 'preview',
        previewUntil: 6,
        expiresAt: 80,
        trail: [],
        lastPosition: { x: 0, z: 0 },
        segment: 0,
        direction: 0,
        started: false,
      },
    };
    const rig = harness([], [entry]);
    rig.setCollapsed(true);
    rig.controller.update(0);
    expect(rig.html()).toContain('Watch the outline. Golden sparkles will guide you.');
    expect(rig.html()).toContain('Round 1 of 3: Triangle.');
    expect(rig.html()).toContain('disabled aria-disabled="true"');
    expect(rig.html()).not.toContain('title="Collapse quest tracker"');
    rig.controller.toggleCollapsed();
    expect(rig.collapsed()).toBe(true);
    expect(rig.settings.setCollapsed).not.toHaveBeenCalled();
    expect(rig.click).not.toHaveBeenCalled();
    if (!entry.tracing) throw new Error('missing tracing fixture');
    entry.tracing.phase = 'failed';
    entry.tracing.reason = 'off-path';
    rig.controller.update(1);
    expect(rig.html()).toContain('You left the outline.');
    const writes = rig.writes();
    rig.controller.update(2);
    expect(rig.writes()).toBe(writes);
    entry.count = 1;
    entry.tracing.shapeIndex = 1;
    entry.tracing.phase = 'preview';
    rig.controller.update(3);
    expect(rig.html()).toContain('Round 2 of 3: Square.');
    expect(rig.html()).not.toContain('You left the outline.');
    entry.count = 2;
    entry.tracing.shapeIndex = 2;
    entry.traceVariant = 'hourglass';
    rig.controller.update(4);
    expect(rig.html()).toContain('Round 3 of 3: Hourglass.');
    expect(rig.html()).not.toContain('2/3');
    entry.state = 'completed';
    entry.count = 3;
    entry.tracing.phase = 'success';
    entry.traceResult = { score: 87, rating: 'silver', precision: 80, efficiency: 90, time: 91 };
    rig.controller.update(5);
    expect(rig.html()).toContain(
      'Silver: 87/100. Base reward unchanged. Gold: deed, title, +10 Renown.',
    );
    expect(rig.html()).not.toContain('3/3');
    expect(rig.html()).toContain('quest-complete');
    expect(rig.html()).not.toContain('You left the outline.');
    delete entry.tracing;
    rig.controller.update(6);
    expect(rig.html()).not.toContain('87/100');
    expect(entry.traceResult.score).toBe(87);
  });

  it('renders authoritative quests in acceptance order and elides an identical paint', () => {
    const test = harness([progress('q_wolves'), progress('q_boars', 'ready')]);

    test.controller.update(0);
    test.controller.update(0);

    expect(test.writes()).toBe(1);
    expect(test.html()).toContain('title:q_wolves');
    expect(test.html()).toContain('title:q_boars');
    expect(test.html().indexOf('title:q_wolves')).toBeLessThan(
      test.html().indexOf('title:q_boars'),
    );
    expect(test.html()).toContain('objective:q_wolves:0');
    expect(test.html()).toContain('quest-complete');
  });

  it('tracks an active world quest without an accepted quest-log entry', () => {
    const quest = WORLD_QUESTS.find((entry) => entry.id === 'wq_eastbrook_bandits');
    expect(quest).toBeDefined();
    if (!quest) throw new Error('missing Eastbrook bandit fixture');
    const test = harness(
      [],
      [
        { questId: quest.id, count: 2, state: 'active' },
        { questId: 'wq_eastbrook_calligraphy', count: 1, state: 'completed' },
      ],
    );

    test.controller.update(0);

    expect(test.html()).toContain('Eastbrook Vale');
    expect(test.html()).not.toContain(`data-quest="${quest.id}"`);
    expect(test.html()).not.toMatch(/class="qt-title" role="button"[^>]*wq_/);
    expect(test.html()).toContain(`2/${quest.count}`);
    expect(test.html()).not.toContain('Arcane Calligraphy');
  });

  it('makes an active puzzle world quest keyboard-openable from the tracker', () => {
    const quest = WORLD_QUESTS.find((entry) => entry.objective.type === 'puzzle');
    expect(quest).toBeDefined();
    if (!quest) return;
    const test = harness([], [{ questId: quest.id, count: 0, state: 'active' }]);

    test.controller.update(0);

    expect(test.html()).not.toContain(`data-world-quest="${quest.id}"`);
    const row = { dataset: { worldQuest: quest.id } };
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    test.dispatch('keydown', {
      key: 'Enter',
      code: 'Enter',
      target: { closest: (selector: string) => (selector === '.qt-title' ? row : null) },
      preventDefault,
      stopPropagation,
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(test.openQuest).not.toHaveBeenCalled();
  });

  it('keeps an unknown quest id tracked at its log position, never a throw (R34)', () => {
    // The log is server truth: a quest accepted on a current client reaches a
    // bundle that predates it. The tracker runs every frame inside
    // hud.update(), so a throw here used to kill the whole HUD tail; and a
    // SKIP would desync the tracker numbers from the world map badges, which
    // number every log entry. The unknown entry renders its raw id with no
    // objectives, and the KNOWN quest behind it keeps number 3.
    // Built by hand: the progress() helper derives counts from QUESTS, which
    // is exactly what an unknown id cannot do (the wire sends counts as-is).
    const ghost = { questId: 'q_ghost_of_v33', state: 'active' as const, counts: [0] };
    // The prototype-key arm: QUESTS is a prototype-bearing Record, so a bare
    // truthiness read resolves 'constructor' to a FUNCTION and the objectives
    // deref throws; only the own-property gate renders it as unknown.
    const proto = { questId: 'constructor', state: 'active' as const, counts: [0] };
    const test = harness([progress('q_wolves'), ghost, proto, progress('q_boars', 'ready')]);

    test.controller.update(0);

    expect(test.html()).toContain('q_ghost_of_v33');
    // The title SAYS unknown (the questUi.tracker.unknownQuest sentence
    // carrying the raw id), never a bare content slug on its own.
    expect(test.html()).toContain('Unknown quest (q_ghost_of_v33)');
    expect(test.html().indexOf('title:q_wolves')).toBeLessThan(
      test.html().indexOf('q_ghost_of_v33'),
    );
    expect(test.html().indexOf('q_ghost_of_v33')).toBeLessThan(
      test.html().indexOf('title:q_boars'),
    );
    // No objective rows for the unknown entries; the prototype key renders
    // as its raw id too, never a function deref.
    expect(test.html()).not.toContain('objective:q_ghost_of_v33');
    expect(test.html()).toContain('constructor');
    expect(test.html()).not.toContain('objective:constructor');
  });

  it('clears a stale collapse preference once when the authoritative log empties', () => {
    const test = harness();
    test.setCollapsed(true);

    test.controller.update(0);
    test.controller.update(0);

    expect(test.settings.setCollapsed).toHaveBeenCalledTimes(1);
    expect(test.settings.setCollapsed).toHaveBeenCalledWith(false);
    expect(test.html()).toBe('');
    expect(test.writes()).toBe(0);
  });

  it('renders the tracker header label through the real questUi.tracker.title key, at its runtime home', () => {
    // The static index.html markup dropped its data-i18n="questUi.tracker.title"
    // node (tests/localization_coverage.test.ts pins the absence): the header
    // label is now painted here, directly via t('questUi.tracker.title')
    // (quest_tracker_controller.ts), never through the questTitle dep (which
    // only names individual quest rows). English source: 'Quests'
    // (src/ui/i18n.catalog/quests.ts).
    const test = harness([progress('q_wolves')]);
    test.controller.update(0);
    expect(test.html()).toContain('<span class="qt-h-label">Quests</span>');
  });

  it('persists a toggle, repaints the collapsed header, and restores header focus', () => {
    const test = harness([progress('q_wolves')]);
    test.controller.update(0);

    test.controller.toggleCollapsed();

    expect(test.collapsed()).toBe(true);
    expect(test.settings.setCollapsed).toHaveBeenLastCalledWith(true);
    expect(test.click).toHaveBeenCalledTimes(1);
    expect(test.html()).toContain('aria-expanded="false"');
    expect(test.html()).not.toContain('title:q_wolves');
    expect(test.header.focus).toHaveBeenCalledTimes(1);
  });

  it('does not restore header focus after a pointer-driven toggle (the focus drop ran first)', () => {
    // hud.ts binds the pointer-only focus drop (src/ui/pointer_blur.ts) over
    // #quest-tracker in the CAPTURE phase, so a mouse click drops the header's
    // focus before the click handler toggles and repaints: the repaint's refocus
    // check (activeElement is a .qt-header) then sees nothing to restore, and the
    // header cannot be left holding focus for Space to re-toggle. Keyboard
    // activation (no drop) keeps the restore above.
    const test = harness([progress('q_wolves')]);
    test.controller.update(0);

    dropPointerFocus(test.header);
    test.controller.toggleCollapsed();

    expect(test.header.blur).toHaveBeenCalledTimes(1);
    expect(test.collapsed()).toBe(true);
    expect(test.header.focus).not.toHaveBeenCalled();
  });
});
