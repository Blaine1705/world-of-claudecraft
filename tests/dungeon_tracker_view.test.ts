// The dungeon objectives tracker's pure core (src/ui/hud/dungeon/dungeon_tracker_view.ts):
// what the plate and its boss rows show for a run, which rows a kill just lit,
// and the same run projected as a page of the touch quest strip. Driven with
// plain IWorld-shaped stubs, one shaped like the offline Sim's read and one like
// the online ClientWorld's decoded mirror, because the core must not care which
// world it is handed.
import { describe, expect, it } from 'vitest';
import { decodeDungeonRun } from '../src/net/dungeon_run_wire';
import { FINDER_ACTIVITIES } from '../src/sim/content/dungeon_finder';
import { dungeonRunPlan } from '../src/sim/instances/dungeon_run';
import {
  buildDungeonTracker,
  DUNGEON_STRIP_QUEST_PREFIX,
  DUNGEON_TRACKER_FLASH_BUILDS,
  DUNGEON_TRACKER_ROW_CAP,
  type DungeonTrackerModel,
  dungeonStripQuest,
  makeDungeonTrackerModel,
} from '../src/ui/hud/dungeon/dungeon_tracker_view';
import { QUEST_STRIP_MAX_OBJECTIVES, questStripView } from '../src/ui/hud/quest/quest_strip_core';
import type { DungeonRunView } from '../src/world_api/dungeons';

const CRYPT = ['sexton_marrow', 'rimeweb', 'cantor_ilvane', 'morthen'] as const;

/** The run as the offline Sim hands it over: frozen, reference-stable. */
function simRun(
  defeated: readonly string[] = [],
  difficulty: 'normal' | 'heroic' = 'normal',
  bosses: readonly string[] = CRYPT,
  dungeonId = 'hollow_crypt',
): DungeonRunView {
  return Object.freeze({
    dungeonId,
    difficulty,
    bosses: Object.freeze(
      bosses.map((mobId) => Object.freeze({ mobId, defeated: defeated.includes(mobId) })),
    ),
  });
}

/** The same run as the online ClientWorld mirrors it: through the wire decode. */
function clientRun(
  defeated: readonly string[] = [],
  difficulty: 'normal' | 'heroic' = 'normal',
): DungeonRunView {
  const run = decodeDungeonRun(JSON.parse(JSON.stringify(simRun(defeated, difficulty))));
  if (!run) throw new Error('the wire decode dropped a well-formed run');
  return run;
}

const SHAPES = [
  ['a Sim-shaped world', simRun],
  ['a ClientWorld-shaped world', clientRun],
] as const;

const rowsOf = (model: DungeonTrackerModel) =>
  model.rows.slice(0, model.count).map((row) => [row.mobId, row.done, row.flash]);

describe('dungeon tracker model', () => {
  it('starts hidden, with its whole row pool preallocated', () => {
    const model = makeDungeonTrackerModel();
    expect(model.visible).toBe(false);
    expect(model.count).toBe(0);
    expect(model.rows).toHaveLength(DUNGEON_TRACKER_ROW_CAP);
    expect(new Set(model.rows).size).toBe(DUNGEON_TRACKER_ROW_CAP);
  });

  it('stays hidden outside a run and for a run with no bosses', () => {
    const model = makeDungeonTrackerModel();
    expect(buildDungeonTracker({ dungeonRun: null }, model).visible).toBe(false);
    expect(buildDungeonTracker({ dungeonRun: simRun([], 'normal', []) }, model).visible).toBe(
      false,
    );
  });

  it.each(SHAPES)('builds the same model from %s', (_label, make) => {
    const model = buildDungeonTracker(
      { dungeonRun: make(['sexton_marrow'], 'heroic') },
      makeDungeonTrackerModel(),
    );
    expect(model.visible).toBe(true);
    expect(model.dungeonId).toBe('hollow_crypt');
    expect(model.heroic).toBe(true);
    expect(model.count).toBe(4);
    expect(model.defeated).toBe(1);
    expect(model.complete).toBe(false);
    expect(rowsOf(model)).toEqual([
      ['sexton_marrow', true, false],
      ['rimeweb', false, false],
      ['cantor_ilvane', false, false],
      ['morthen', false, false],
    ]);
  });

  it('the two world shapes yield field-for-field identical models', () => {
    const a = buildDungeonTracker(
      { dungeonRun: simRun(['rimeweb', 'morthen'], 'heroic') },
      makeDungeonTrackerModel(),
    );
    const b = buildDungeonTracker(
      { dungeonRun: clientRun(['rimeweb', 'morthen'], 'heroic') },
      makeDungeonTrackerModel(),
    );
    expect(a).toEqual(b);
  });

  it('marks a normal run as not heroic', () => {
    const model = buildDungeonTracker({ dungeonRun: simRun() }, makeDungeonTrackerModel());
    expect(model.heroic).toBe(false);
  });

  it('rebuilds in place: the same container and the same row objects every build', () => {
    const model = makeDungeonTrackerModel();
    const rows = model.rows;
    const first = [...rows];
    for (const defeated of [[], ['sexton_marrow'], ['sexton_marrow', 'rimeweb']]) {
      const out = buildDungeonTracker({ dungeonRun: simRun(defeated) }, model);
      expect(out).toBe(model);
      expect(out.rows).toBe(rows);
      expect(out.rows.every((row, i) => row === first[i])).toBe(true);
    }
    expect(buildDungeonTracker({ dungeonRun: null }, model)).toBe(model);
    expect(model.rows).toBe(rows);
  });

  it('reads complete only when every boss is down', () => {
    const model = makeDungeonTrackerModel();
    buildDungeonTracker(
      { dungeonRun: simRun(['sexton_marrow', 'rimeweb', 'cantor_ilvane']) },
      model,
    );
    expect([model.defeated, model.complete]).toEqual([3, false]);
    buildDungeonTracker({ dungeonRun: simRun([...CRYPT]) }, model);
    expect([model.defeated, model.complete]).toEqual([4, true]);
  });

  it('clamps a boss list longer than the pool instead of running off it', () => {
    const long = Array.from({ length: DUNGEON_TRACKER_ROW_CAP + 3 }, (_, i) => `boss_${i}`);
    const model = buildDungeonTracker(
      { dungeonRun: simRun([], 'normal', long) },
      makeDungeonTrackerModel(),
    );
    expect(model.count).toBe(DUNGEON_TRACKER_ROW_CAP);
    expect(model.rows).toHaveLength(DUNGEON_TRACKER_ROW_CAP);
  });

  it('no authored dungeon comes near the pool, or the strip page cap', () => {
    const tracked = FINDER_ACTIVITIES.map((a) => dungeonRunPlan(a.dungeonId, a.difficulty)).filter(
      (plan) => plan !== null,
    );
    expect(tracked.length).toBeGreaterThanOrEqual(10);
    for (const plan of tracked) {
      expect(plan.length).toBeLessThanOrEqual(DUNGEON_TRACKER_ROW_CAP);
      // The strip shows a page's objectives in full only up to its own cap.
      expect(plan.length).toBeLessThanOrEqual(QUEST_STRIP_MAX_OBJECTIVES);
    }
  });
});

describe('dungeon tracker kill highlight', () => {
  it('never lights a row that was already down when the tracker appeared', () => {
    const model = makeDungeonTrackerModel();
    buildDungeonTracker({ dungeonRun: simRun(['sexton_marrow', 'rimeweb']) }, model);
    expect(model.rows.slice(0, 4).map((row) => row.flash)).toEqual([false, false, false, false]);
    expect(model.completeFlash).toBe(false);
  });

  it('lights the row of a boss that falls while the tracker is up, then lets it rest', () => {
    const model = makeDungeonTrackerModel();
    buildDungeonTracker({ dungeonRun: simRun() }, model);
    const after = simRun(['rimeweb']);
    for (let build = 0; build < DUNGEON_TRACKER_FLASH_BUILDS; build++) {
      buildDungeonTracker({ dungeonRun: after }, model);
      expect(model.rows[1].flash, `build ${build}`).toBe(true);
      expect(model.rows[0].flash).toBe(false);
    }
    buildDungeonTracker({ dungeonRun: after }, model);
    expect(model.rows[1].flash).toBe(false);
    expect(model.rows[1].done).toBe(true);
  });

  it('lights two bosses that fall on the same poll, each on its own row', () => {
    const model = makeDungeonTrackerModel();
    buildDungeonTracker({ dungeonRun: simRun() }, model);
    buildDungeonTracker({ dungeonRun: simRun(['sexton_marrow', 'cantor_ilvane']) }, model);
    expect(model.rows.slice(0, 4).map((row) => row.flash)).toEqual([true, false, true, false]);
  });

  it('lights the plate when the LAST boss falls in view, not for a run entered already finished', () => {
    const watched = makeDungeonTrackerModel();
    buildDungeonTracker(
      { dungeonRun: simRun(['sexton_marrow', 'rimeweb', 'cantor_ilvane']) },
      watched,
    );
    expect(watched.completeFlash).toBe(false);
    const done = simRun([...CRYPT]);
    for (let build = 0; build < DUNGEON_TRACKER_FLASH_BUILDS; build++) {
      buildDungeonTracker({ dungeonRun: done }, watched);
      expect(watched.completeFlash, `build ${build}`).toBe(true);
      expect(watched.complete).toBe(true);
    }
    buildDungeonTracker({ dungeonRun: done }, watched);
    expect(watched.completeFlash).toBe(false);
    expect(watched.complete).toBe(true);

    const walkedIn = makeDungeonTrackerModel();
    buildDungeonTracker({ dungeonRun: done }, walkedIn);
    expect([walkedIn.complete, walkedIn.completeFlash]).toEqual([true, false]);
  });

  it('treats leaving and coming back as a first sighting', () => {
    const model = makeDungeonTrackerModel();
    buildDungeonTracker({ dungeonRun: simRun() }, model);
    buildDungeonTracker({ dungeonRun: null }, model);
    // The boss died while the player was outside: nothing to celebrate on return.
    buildDungeonTracker({ dungeonRun: simRun(['sexton_marrow']) }, model);
    expect(model.rows[0]).toMatchObject({ done: true, flash: false });
  });

  it('treats another dungeon, or the other difficulty, as a first sighting', () => {
    const model = makeDungeonTrackerModel();
    buildDungeonTracker({ dungeonRun: simRun() }, model);
    buildDungeonTracker({ dungeonRun: simRun(['sexton_marrow'], 'heroic') }, model);
    expect(model.rows[0]).toMatchObject({ done: true, flash: false });
    buildDungeonTracker(
      {
        dungeonRun: simRun(
          ['knight_commander_olen'],
          'heroic',
          ['knight_commander_olen', 'gaol_turnkey', 'gaoler_ossick', 'vael_the_mistcaller'],
          'sunken_bastion',
        ),
      },
      model,
    );
    expect(model.dungeonId).toBe('sunken_bastion');
    expect(model.rows[0]).toMatchObject({
      mobId: 'knight_commander_olen',
      done: true,
      flash: false,
    });
  });

  it('drops a highlight at once if the row reopens (a fresh claim of the same dungeon)', () => {
    const model = makeDungeonTrackerModel();
    buildDungeonTracker({ dungeonRun: simRun() }, model);
    buildDungeonTracker({ dungeonRun: simRun(['sexton_marrow']) }, model);
    expect(model.rows[0].flash).toBe(true);
    buildDungeonTracker({ dungeonRun: simRun() }, model);
    expect(model.rows[0]).toMatchObject({ done: false, flash: false, flashHold: 0 });
  });
});

describe('dungeon run as a touch quest strip page', () => {
  const text = {
    title: (dungeonId: string, heroic: boolean) => `<${dungeonId}${heroic ? '+H' : ''}>`,
    bossName: (mobId: string) => `[${mobId}]`,
  };

  it('is null outside a run', () => {
    expect(dungeonStripQuest({ dungeonRun: null }, text)).toBeNull();
    expect(dungeonStripQuest({ dungeonRun: simRun([], 'normal', []) }, text)).toBeNull();
  });

  it.each(SHAPES)('projects the run onto the strip model from %s', (_label, make) => {
    const quest = dungeonStripQuest({ dungeonRun: make(['sexton_marrow'], 'heroic') }, text);
    expect(quest).toEqual({
      id: `${DUNGEON_STRIP_QUEST_PREFIX}hollow_crypt:heroic`,
      number: 0,
      title: '<hollow_crypt+H>',
      complete: false,
      objectives: [
        { label: '[sexton_marrow]', current: 1, total: 1 },
        { label: '[rimeweb]', current: 0, total: 1 },
        { label: '[cantor_ilvane]', current: 0, total: 1 },
        { label: '[morthen]', current: 0, total: 1 },
      ],
    });
  });

  it('is a different page per difficulty, and never collides with a quest id', () => {
    const normal = dungeonStripQuest({ dungeonRun: simRun() }, text);
    const heroic = dungeonStripQuest({ dungeonRun: simRun([], 'heroic') }, text);
    expect(normal?.id).not.toBe(heroic?.id);
    expect(normal?.id.startsWith(DUNGEON_STRIP_QUEST_PREFIX)).toBe(true);
    expect(DUNGEON_STRIP_QUEST_PREFIX).toContain(':');
    expect(normal?.title).toBe('<hollow_crypt>');
  });

  it('reads complete once every boss is down', () => {
    expect(dungeonStripQuest({ dungeonRun: simRun([...CRYPT]) }, text)?.complete).toBe(true);
    expect(dungeonStripQuest({ dungeonRun: simRun(['morthen']) }, text)?.complete).toBe(false);
  });

  it('the strip shows every boss of the page, each done or not', () => {
    const quest = dungeonStripQuest({ dungeonRun: simRun(['rimeweb']) }, text);
    if (!quest) throw new Error('no page');
    const view = questStripView([quest], 0);
    expect(view.hiddenObjectives).toBe(0);
    expect(view.objectives.map((o) => [o.label, o.done])).toEqual([
      ['[sexton_marrow]', false],
      ['[rimeweb]', true],
      ['[cantor_ilvane]', false],
      ['[morthen]', false],
    ]);
  });
});
