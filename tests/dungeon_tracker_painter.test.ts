// @vitest-environment happy-dom
// Behavioral pin for the dungeon objectives tracker painter
// (src/ui/hud/dungeon/dungeon_tracker_painter.ts): the plate and boss rows it
// states for a run, that every refresh rides the write-elision facet (an
// unchanged run writes nothing), that its names come from the entity name keys
// and never from a literal, and the source contracts a per-file scan can hold.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { decodeDungeonRun } from '../src/net/dungeon_run_wire';
import { mobDisplayName as mobName } from '../src/ui/entity_display_core';
import { dungeonDisplayName } from '../src/ui/entity_i18n';
import { DungeonTrackerPainter } from '../src/ui/hud/dungeon/dungeon_tracker_painter';
import {
  DUNGEON_TRACKER_FLASH_BUILDS,
  DUNGEON_TRACKER_ROW_CAP,
} from '../src/ui/hud/dungeon/dungeon_tracker_view';
import { ensureLocaleLoaded, setLanguage, t } from '../src/ui/i18n';
import { makeWriterFacet, type PainterHostWriters } from '../src/ui/painter_host';
import type { DungeonRunView } from '../src/world_api/dungeons';

const CRYPT = ['sexton_marrow', 'rimeweb', 'cantor_ilvane', 'morthen'] as const;

function run(
  defeated: readonly string[] = [],
  difficulty: 'normal' | 'heroic' = 'normal',
): DungeonRunView {
  return Object.freeze({
    dungeonId: 'hollow_crypt',
    difficulty,
    bosses: CRYPT.map((mobId) => ({ mobId, defeated: defeated.includes(mobId) })),
  });
}

/** The same run through the online decode, as a ClientWorld holds it. */
function mirrored(view: DungeonRunView): DungeonRunView {
  const decoded = decodeDungeonRun(JSON.parse(JSON.stringify(view)));
  if (!decoded) throw new Error('decode dropped the run');
  return decoded;
}

/** The real elided facet over fresh caches, counting what reaches the DOM. */
function countingFacet(): { facet: PainterHostWriters; counts: { writes: number; skips: number } } {
  const counts = { writes: 0, skips: 0 };
  const facet = makeWriterFacet(
    new Map(),
    new Map(),
    new Map(),
    new Map(),
    () => {
      counts.writes++;
    },
    () => {
      counts.skips++;
    },
  );
  return { facet, counts };
}

function rig(initial: DungeonRunView | null = null) {
  const root = document.createElement('div');
  root.id = 'dungeon-tracker';
  const world = { dungeonRun: initial };
  const { facet, counts } = countingFacet();
  const painter = new DungeonTrackerPainter({
    root: () => root,
    writers: facet,
    world: () => world,
    dungeonName: dungeonDisplayName,
    mobName,
  });
  const q = (selector: string) => root.querySelector(selector) as HTMLElement;
  const rows = () =>
    [...root.querySelectorAll<HTMLElement>('.dgt-row')].filter(
      (row) => row.style.display !== 'none',
    );
  return { root, world, painter, counts, q, rows };
}

beforeEach(() => {
  setLanguage('en');
});

describe('DungeonTrackerPainter: skeleton', () => {
  it('builds the plate and the whole row pool once, hidden, with no text', () => {
    const { root, q } = rig();
    expect(q('.dgt-plate').classList.contains('ui-panel-soft')).toBe(true);
    expect(q('.dgt-name').classList.contains('ui-cin')).toBe(true);
    expect(q('.dgt-diff').classList.contains('ui-chip')).toBe(true);
    expect(q('.dgt-bar').classList.contains('ui-bar')).toBe(true);
    expect(q('.dgt-bar-fill').classList.contains('ui-bar-fill')).toBe(true);
    const pool = root.querySelectorAll<HTMLElement>('.dgt-row');
    expect(pool).toHaveLength(DUNGEON_TRACKER_ROW_CAP);
    for (const row of pool) expect(row.style.display).toBe('none');
    expect(root.textContent).toBe('');
    // The decorations are hidden from assistive tech; the list is a real list.
    expect(q('.dgt-bar').getAttribute('aria-hidden')).toBe('true');
    expect(q('.dgt-mark').getAttribute('aria-hidden')).toBe('true');
    expect(q('.dgt-list').getAttribute('role')).toBe('list');
    expect(pool[0].getAttribute('role')).toBe('listitem');
  });

  it('never rebuilds: the same nodes carry every later paint', () => {
    const { root, world, painter, q } = rig(run());
    const plate = q('.dgt-plate');
    const firstRow = root.querySelector('.dgt-row');
    painter.update();
    world.dungeonRun = run(['sexton_marrow']);
    painter.update();
    world.dungeonRun = null;
    painter.update();
    world.dungeonRun = run([...CRYPT], 'heroic');
    painter.update();
    expect(q('.dgt-plate')).toBe(plate);
    expect(root.querySelector('.dgt-row')).toBe(firstRow);
    expect(root.querySelectorAll('.dgt-row')).toHaveLength(DUNGEON_TRACKER_ROW_CAP);
  });
});

describe('DungeonTrackerPainter: what it shows', () => {
  it('stays out of the stack outside a run, and joins it inside one', () => {
    const { root, world, painter } = rig();
    painter.update();
    expect(root.classList.contains('is-live')).toBe(false);
    world.dungeonRun = run();
    painter.update();
    expect(root.classList.contains('is-live')).toBe(true);
    world.dungeonRun = null;
    painter.update();
    expect(root.classList.contains('is-live')).toBe(false);
  });

  it('names the dungeon and every boss from the entity name keys, counted 0 of 1', () => {
    const { painter, q, rows, root } = rig(run());
    painter.update();
    expect(q('.dgt-name').textContent).toBe('The Hollow Crypt');
    expect(rows().map((row) => row.querySelector('.dgt-boss')?.textContent)).toEqual([
      'Sexton Marrow',
      'Lady of the Bonechill',
      'Cantor Ilvane',
      'Morthen the Gravecaller',
    ]);
    const zeroOfOne = t('hudChrome.questTracker.objectiveValue', { current: '0', total: '1' });
    expect(zeroOfOne).toBe('0 / 1');
    for (const row of rows()) {
      expect(row.querySelector('.dgt-count')?.textContent).toBe(zeroOfOne);
      expect(row.classList.contains('is-done')).toBe(false);
    }
    expect(q('.dgt-tally').textContent).toBe('0 / 4');
    expect(q('.dgt-bar-fill').style.width).toBe('0%');
    // The group's accessible name is the tracker's own frame name.
    expect(root.getAttribute('aria-label')).toBe('Dungeon Tracker');
  });

  it('reads a row count first, the classic objective line', () => {
    const { painter, rows } = rig(run());
    painter.update();
    const row = rows()[0];
    expect([...row.children].map((child) => child.className.split(' ')[0])).toEqual([
      'dgt-count',
      'dgt-boss',
      'dgt-mark',
    ]);
    expect(row.textContent).toBe('0 / 1Sexton Marrow');
  });

  it('ticks a boss to 1 of 1, marks its row done, and moves the rail and tally', () => {
    const { world, painter, q, rows } = rig(run());
    painter.update();
    world.dungeonRun = run(['rimeweb']);
    painter.update();
    const [marrow, lady] = rows();
    expect(lady.querySelector('.dgt-count')?.textContent).toBe('1 / 1');
    expect(lady.classList.contains('is-done')).toBe(true);
    expect(lady.classList.contains('is-flash')).toBe(true);
    expect(marrow.classList.contains('is-done')).toBe(false);
    expect(marrow.classList.contains('is-flash')).toBe(false);
    expect(q('.dgt-tally').textContent).toBe('1 / 4');
    expect(q('.dgt-bar-fill').style.width).toBe('25%');
  });

  it('lets the kill highlight go after its hold, leaving the row done', () => {
    const { world, painter, rows } = rig(run());
    painter.update();
    world.dungeonRun = run(['sexton_marrow']);
    for (let i = 0; i < DUNGEON_TRACKER_FLASH_BUILDS; i++) painter.update();
    expect(rows()[0].classList.contains('is-flash')).toBe(true);
    painter.update();
    expect(rows()[0].classList.contains('is-flash')).toBe(false);
    expect(rows()[0].classList.contains('is-done')).toBe(true);
  });

  it('shows the difficulty only on a heroic run', () => {
    const { world, painter, q } = rig(run());
    painter.update();
    expect(q('.dgt-plate').classList.contains('is-heroic')).toBe(false);
    expect(q('.dgt-diff').textContent).toBe('');
    world.dungeonRun = run([], 'heroic');
    painter.update();
    expect(q('.dgt-plate').classList.contains('is-heroic')).toBe(true);
    expect(q('.dgt-diff').textContent).toBe(t('hudChrome.finder.heroic'));
    expect(q('.dgt-diff').textContent).toBe('Heroic');
  });

  it('reads a finished run as complete: full rail, the Complete word, every row done', () => {
    const { world, painter, q, rows } = rig(run(['sexton_marrow', 'rimeweb', 'cantor_ilvane']));
    painter.update();
    expect(q('.dgt-plate').classList.contains('is-complete')).toBe(false);
    world.dungeonRun = run([...CRYPT]);
    painter.update();
    expect(q('.dgt-plate').classList.contains('is-complete')).toBe(true);
    expect(q('.dgt-plate').classList.contains('is-complete-flash')).toBe(true);
    expect(q('.dgt-tally').textContent).toBe(t('questUi.tracker.complete'));
    expect(q('.dgt-tally').textContent).toBe('Complete');
    expect(q('.dgt-bar-fill').style.width).toBe('100%');
    expect(rows().every((row) => row.classList.contains('is-done'))).toBe(true);
    expect(rows().every((row) => row.querySelector('.dgt-count')?.textContent === '1 / 1')).toBe(
      true,
    );
  });

  it('a run walked into already finished is complete without the glow', () => {
    const { painter, q } = rig(run([...CRYPT]));
    painter.update();
    expect(q('.dgt-plate').classList.contains('is-complete')).toBe(true);
    expect(q('.dgt-plate').classList.contains('is-complete-flash')).toBe(false);
  });

  it('hides the rows a shorter boss list leaves behind, and clears their state', () => {
    const { world, painter, rows, root } = rig(run([...CRYPT]));
    painter.update();
    expect(rows()).toHaveLength(4);
    world.dungeonRun = Object.freeze({
      dungeonId: 'drowned_temple',
      difficulty: 'normal' as const,
      bosses: [
        { mobId: 'choirmother_selthe', defeated: false },
        { mobId: 'tideglass_colossus', defeated: false },
        { mobId: 'ysolei', defeated: false },
      ],
    });
    painter.update();
    expect(rows()).toHaveLength(3);
    const fourth = root.querySelectorAll<HTMLElement>('.dgt-row')[3];
    expect(fourth.style.display).toBe('none');
    expect(fourth.classList.contains('is-done')).toBe(false);
    expect(fourth.classList.contains('is-flash')).toBe(false);
  });

  it('repaints in the new language on the next poll, with no fan-out arm', async () => {
    const { painter, q, rows, root } = rig(run([], 'heroic'));
    painter.update();
    expect(q('.dgt-name').textContent).toBe('The Hollow Crypt');
    expect(q('.dgt-diff').textContent).toBe('Heroic');
    await ensureLocaleLoaded('ja_JP');
    setLanguage('ja_JP');
    // The run did not change. The facet compares RESOLVED text, so the plain
    // next poll repaints every string by itself.
    painter.update();
    expect(q('.dgt-name').textContent).toBe(dungeonDisplayName('hollow_crypt'));
    expect(q('.dgt-name').textContent).not.toBe('The Hollow Crypt');
    expect(q('.dgt-diff').textContent).toBe(t('hudChrome.finder.heroic'));
    expect(q('.dgt-diff').textContent).not.toBe('Heroic');
    expect(rows()[0].querySelector('.dgt-boss')?.textContent).toBe(mobName('sexton_marrow'));
    expect(rows()[0].querySelector('.dgt-boss')?.textContent).not.toBe('Sexton Marrow');
    expect(root.getAttribute('aria-label')).not.toBe('Dungeon Tracker');
    expect(root.getAttribute('aria-label')).toBe(
      t('hudChrome.interfaceUnlock.frameNames.dungeonTracker'),
    );
  });
});

describe('DungeonTrackerPainter: write elision (the per-frame budget)', () => {
  it.each([
    ['a Sim-shaped run', (view: DungeonRunView) => view],
    ['a ClientWorld-shaped run', mirrored],
  ])('an unchanged %s writes once and then nothing', (_label, shape) => {
    const { world, painter, counts } = rig(shape(run(['sexton_marrow'], 'heroic')));
    painter.update();
    const establishing = counts.writes;
    expect(establishing).toBeGreaterThan(10);
    // Let the (absent) highlight holds settle, then drive identical frames.
    for (let i = 0; i < 40; i++) painter.update();
    expect(counts.writes).toBe(establishing);
    expect(counts.skips).toBeGreaterThan(0);
    // A real change writes again: the elision is not a stuck painter.
    world.dungeonRun = shape(run(['sexton_marrow', 'rimeweb'], 'heroic'));
    painter.update();
    expect(counts.writes).toBeGreaterThan(establishing);
  });

  it('writes nothing at all while there is no run', () => {
    const { painter, counts } = rig();
    painter.update();
    const first = counts.writes;
    for (let i = 0; i < 20; i++) painter.update();
    expect(counts.writes).toBe(first);
    expect(first).toBeLessThanOrEqual(1);
  });

  it('a kill settles: the highlight costs a bounded number of writes, then silence', () => {
    const { world, painter, counts } = rig(run());
    painter.update();
    world.dungeonRun = run(['cantor_ilvane']);
    for (let i = 0; i < DUNGEON_TRACKER_FLASH_BUILDS + 2; i++) painter.update();
    const settled = counts.writes;
    for (let i = 0; i < 30; i++) painter.update();
    expect(counts.writes).toBe(settled);
  });
});

describe('DungeonTrackerPainter: the touch strip page', () => {
  it('is null outside a run and carries real names inside one', () => {
    const { world, painter } = rig();
    expect(painter.stripQuest()).toBeNull();
    world.dungeonRun = run(['sexton_marrow']);
    expect(painter.stripQuest()).toMatchObject({
      title: 'The Hollow Crypt',
      complete: false,
      objectives: [
        { label: 'Sexton Marrow', current: 1, total: 1 },
        { label: 'Lady of the Bonechill', current: 0, total: 1 },
        { label: 'Cantor Ilvane', current: 0, total: 1 },
        { label: 'Morthen the Gravecaller', current: 0, total: 1 },
      ],
    });
  });

  it('titles a heroic run with its difficulty through the catalog template', () => {
    const { painter } = rig(run([], 'heroic'));
    expect(painter.stripQuest()?.title).toBe(
      t('hudChrome.dungeonTracker.heroicTitle', {
        name: 'The Hollow Crypt',
        difficulty: t('hudChrome.finder.heroic'),
      }),
    );
    expect(painter.stripQuest()?.title).toBe('The Hollow Crypt (Heroic)');
  });
});

describe('dungeon tracker source contracts', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const painter = read('../src/ui/hud/dungeon/dungeon_tracker_painter.ts');
  const view = read('../src/ui/hud/dungeon/dungeon_tracker_view.ts');

  it('the painter carries no color, pixel or English literal of its own', () => {
    const code = painter.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\brgba?\(/);
    expect(code).not.toMatch(/\d+px/);
    // Every string it renders is a t() key, a formatter result, or a resolver's.
    expect(code).not.toMatch(/setText\([^,]+,\s*['"`][A-Za-z]/);
    expect(code).not.toMatch(/Heroic|Complete|Dungeon Tracker/);
  });

  it('the painter talks to IWorld only, never to a concrete world', () => {
    expect(painter).not.toMatch(/from ['"][^'"]*\/sim\/sim['"]/);
    expect(painter).not.toMatch(/from ['"][^'"]*\/net\/online['"]/);
    expect(painter).toContain("Pick<IWorld, 'dungeonRun'>");
  });

  it('the core is DOM-free and resolves no text itself', () => {
    expect(view).not.toMatch(/\bdocument\b|\bwindow\b|HTMLElement/);
    expect(view).not.toMatch(/from ['"][^'"]*\/i18n['"]/);
    expect(view).not.toMatch(/\bt\(/);
  });
});
