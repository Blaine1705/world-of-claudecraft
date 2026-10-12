// Dungeon objectives tracker painter (#dungeon-tracker): the plate at the top
// of the right tracker stack that names the group dungeon a player stands in,
// with a progress rail, and under it one row per boss counted 0 of 1 until it
// falls ("0 / 1 Sexton Marrow"). Thin consumer of dungeon_tracker_view.ts.
//
// The tracker-painter contract of the deed and Reliquary strips, on the same
// budget: the static skeleton (the plate plus a fixed pool of
// DUNGEON_TRACKER_ROW_CAP rows) is built ONCE in the constructor, in a single
// innerHTML write (see the allowance in tests/hud_perf_budget.test.ts), and
// every refresh routes through the PainterHostWriters elided facet only. The
// nodes therefore PERSIST across a boss kill, which is what lets the done
// state ease in (a CSS transition on the row) instead of popping: a rebuild
// would replace the row and there would be nothing to transition from.
//
// Locale: every string here is resolved on each poll and handed to the facet,
// which compares the RESOLVED text, so a runtime language switch repaints by
// itself on the next poll and the tracker needs no arm in the language fan-out.
//
// Names never come from a literal: the dungeon and each boss resolve through
// the injected entity-name resolvers from the ids the sim carries, and the
// counts through the formatter. Everything painted is actionable progress, so
// none of it varies with the graphics tier (the kill glow is a decoration over
// a count that is already on screen, and it rides the motion kills in CSS).

import type { IWorld } from '../../../world_api';
import { formatNumber, t } from '../../i18n';
import type { PainterHostWriters } from '../../painter_host';
import { svgIcon } from '../../ui_icons';
import type { TrackedQuest } from '../quest/quest_tracker';
import {
  buildDungeonTracker,
  DUNGEON_TRACKER_ROW_CAP,
  type DungeonStripText,
  type DungeonTrackerModel,
  dungeonStripQuest,
  makeDungeonTrackerModel,
} from './dungeon_tracker_view';

export interface DungeonTrackerPainterDeps {
  /** The #dungeon-tracker container (Hud owns the id). */
  root(): HTMLElement;
  /** The shared write-elision facet (Hud's caches; one skip-rate). */
  writers: PainterHostWriters;
  world(): Pick<IWorld, 'dungeonRun'>;
  /** Localized dungeon name for a dungeon id (the entity name resolver). */
  dungeonName(dungeonId: string): string;
  /** Localized mob name for a boss's template id. */
  mobName(mobId: string): string;
}

interface TrackerRowEls {
  row: HTMLElement;
  boss: HTMLElement;
  count: HTMLElement;
}

export class DungeonTrackerPainter {
  private readonly root: HTMLElement;
  private readonly plate: HTMLElement;
  private readonly name: HTMLElement;
  private readonly difficulty: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly tally: HTMLElement;
  private readonly rows: TrackerRowEls[] = [];
  private readonly model: DungeonTrackerModel = makeDungeonTrackerModel();
  private readonly stripText: DungeonStripText;

  constructor(private readonly deps: DungeonTrackerPainterDeps) {
    this.root = deps.root();
    this.stripText = {
      title: (dungeonId, heroic) =>
        heroic
          ? t('hudChrome.dungeonTracker.heroicTitle', {
              name: deps.dungeonName(dungeonId),
              difficulty: t('hudChrome.finder.heroic'),
            })
          : deps.dungeonName(dungeonId),
      bossName: deps.mobName,
    };
    // Static skeleton, built once (chrome only; every visible string is
    // painted through the elided writers below). A row reads count first, the
    // classic objective line, so its text hugs the left edge of the column and
    // never reaches under the button rail. The rail and the check are
    // decoration: the boss name and its count carry the meaning as text.
    const rowHtml =
      `<div class="dgt-row" role="listitem" style="display:none">` +
      `<span class="dgt-count ui-num"></span><span class="dgt-boss"></span>` +
      `<span class="dgt-mark" aria-hidden="true">${svgIcon('check')}</span></div>`;
    this.root.innerHTML =
      `<div class="dgt-plate ui-panel-soft">` +
      `<div class="dgt-name ui-cin"></div>` +
      `<div class="dgt-progress"><span class="dgt-diff ui-chip"></span>` +
      `<span class="dgt-bar ui-bar" aria-hidden="true">` +
      `<span class="dgt-bar-fill ui-bar-fill"></span></span>` +
      `<span class="dgt-tally ui-num"></span></div></div>` +
      `<div class="dgt-list" role="list">${rowHtml.repeat(DUNGEON_TRACKER_ROW_CAP)}</div>`;
    this.plate = this.root.querySelector('.dgt-plate') as HTMLElement;
    this.name = this.root.querySelector('.dgt-name') as HTMLElement;
    this.difficulty = this.root.querySelector('.dgt-diff') as HTMLElement;
    this.fill = this.root.querySelector('.dgt-bar-fill') as HTMLElement;
    this.tally = this.root.querySelector('.dgt-tally') as HTMLElement;
    for (const row of this.root.querySelectorAll<HTMLElement>('.dgt-row')) {
      this.rows.push({
        row,
        boss: row.querySelector('.dgt-boss') as HTMLElement,
        count: row.querySelector('.dgt-count') as HTMLElement,
      });
    }
  }

  /** Medium-band repaint: rebuild the reused model, then state the DOM. */
  update(): void {
    const w = this.deps.writers;
    const view = buildDungeonTracker(this.deps.world(), this.model);
    // Visibility is this one class: the stylesheet folds the tracker out of
    // the stack without it, and keeps the empty plate out of the placeholder
    // the frame editor force-shows for a hidden tracker.
    w.toggleClass(this.root, 'is-live', view.visible);
    if (!view.visible) return;
    w.setAttr(this.root, 'aria-label', t('hudChrome.interfaceUnlock.frameNames.dungeonTracker'));
    w.setText(this.name, this.deps.dungeonName(view.dungeonId));
    w.toggleClass(this.plate, 'is-heroic', view.heroic);
    w.setText(this.difficulty, view.heroic ? t('hudChrome.finder.heroic') : '');
    w.toggleClass(this.plate, 'is-complete', view.complete);
    w.toggleClass(this.plate, 'is-complete-flash', view.completeFlash);
    w.setWidth(this.fill, `${Math.round((view.defeated / view.count) * 100)}%`);
    w.setText(
      this.tally,
      view.complete ? t('questUi.tracker.complete') : this.progress(view.defeated, view.count),
    );
    for (let i = 0; i < this.rows.length; i++) {
      const els = this.rows[i];
      if (i >= view.count) {
        w.setDisplay(els.row, 'none');
        // Clear the state with the row: a class left on a pooled slot would
        // elide the next real kill glow of whichever boss lands here.
        w.toggleClass(els.row, 'is-done', false);
        w.toggleClass(els.row, 'is-flash', false);
        continue;
      }
      const row = view.rows[i];
      w.setDisplay(els.row, '');
      w.toggleClass(els.row, 'is-done', row.done);
      w.toggleClass(els.row, 'is-flash', row.flash);
      w.setText(els.boss, this.deps.mobName(row.mobId));
      w.setText(els.count, this.progress(row.done ? 1 : 0, 1));
    }
  }

  /**
   * The run as a page of the touch quest strip (null outside a tracked
   * dungeon). The plate is hidden on touch, where the strip is the tracker, so
   * the quest tracker's controller asks for this and hands it to the strip.
   * Resolved fresh on every call: the strip keys its own repaint on the
   * resolved text, so a language switch needs nothing remembered here.
   */
  stripQuest(): TrackedQuest | null {
    return dungeonStripQuest(this.deps.world(), this.stripText);
  }

  /** "current / total" in the quest tracker's own counted-objective template. */
  private progress(current: number, total: number): string {
    return t('hudChrome.questTracker.objectiveValue', {
      current: formatNumber(current, { maximumFractionDigits: 0 }),
      total: formatNumber(total, { maximumFractionDigits: 0 }),
    });
  }
}
