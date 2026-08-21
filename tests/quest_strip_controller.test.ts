// @vitest-environment happy-dom
// What only a DOM can show about the touch quest strip. The arithmetic has its
// own suite (quest_strip_core.test.ts) and is not repeated here: this covers the
// wiring around it, which is where the strip can actually break.
//
//   - the cycle gestures through real pointer events (tap advances, swipe LEFT
//     advances, swipe RIGHT goes back, both wrapping), plus the assistive click
//     path that emits no pointer events at all,
//   - the rendered strings, so the objective cap and the "+N more" overflow are
//     pinned against the real t() catalog rather than a stub,
//   - the handoff: on touch the tracker stops rendering its own markup and the
//     strip is fed the SAME projection, which is what makes this a second
//     presentation rather than a second data model.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QUESTS } from '../src/sim/data';
import type { QuestProgress } from '../src/sim/types';
import { buildQuestStrip } from '../src/ui/hud/quest/quest_strip_controller';
import { QUEST_STRIP_MAX_OBJECTIVES } from '../src/ui/hud/quest/quest_strip_core';
import type { TrackedQuest } from '../src/ui/hud/quest/quest_tracker';
import { QuestTrackerController } from '../src/ui/hud/quest/quest_tracker_controller';
import type { IWorld } from '../src/world_api';

/** Past QUEST_STRIP_SWIPE_DEADZONE_PX (22) in either direction. */
const SWIPE_PX = 40;

const STRIP_MARKUP = `
  <div id="quest-strip" class="empty">
    <button type="button" id="quest-strip-main" class="panel">
      <span class="quest-strip-title-row">
        <span id="quest-strip-title" class="quest-strip-title"></span>
        <span id="quest-strip-complete" class="quest-complete"></span>
        <span id="quest-strip-cycle" class="quest-strip-cycle" aria-hidden="true"><span id="quest-strip-prev" class="quest-strip-arrow">&#8249;</span><span id="quest-strip-count" class="quest-strip-count"></span><span id="quest-strip-next" class="quest-strip-arrow">&#8250;</span></span>
      </span>
      <span class="quest-strip-objs">
        <span class="quest-strip-obj"></span>
        <span class="quest-strip-obj"></span>
        <span class="quest-strip-obj"></span>
        <span class="quest-strip-obj"></span>
        <span id="quest-strip-more" class="quest-strip-obj quest-strip-more"></span>
      </span>
    </button>
  </div>`;

function quest(id: string, objectiveCount = 1): TrackedQuest {
  return {
    id,
    number: 1,
    title: `Title ${id}`,
    complete: false,
    objectives: Array.from({ length: objectiveCount }, (_unused, index) => ({
      label: `Objective ${index}`,
      current: index,
      total: 3,
    })),
  };
}

function mountStrip() {
  const controls = document.createElement('section');
  controls.id = 'mobile-controls';
  controls.innerHTML = STRIP_MARKUP;
  document.body.append(controls);
  document.body.classList.add('mobile-touch');
  const click = vi.fn();
  const controller = buildQuestStrip({ click });
  if (!controller) throw new Error('the strip markup did not resolve');
  const el = (id: string) => document.getElementById(id) as HTMLElement;
  return {
    controller,
    click,
    root: el('quest-strip'),
    surface: el('quest-strip-main'),
    title: el('quest-strip-title'),
    counter: el('quest-strip-count'),
    more: el('quest-strip-more'),
    objectives: [
      ...document.querySelectorAll<HTMLElement>('.quest-strip-obj:not(.quest-strip-more)'),
    ],
  };
}

function pointer(type: string, clientX: number): MouseEvent {
  return Object.assign(new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY: 20 }), {
    pointerId: 1,
    pointerType: 'touch',
  });
}

function swipe(surface: HTMLElement, dx: number): void {
  surface.dispatchEvent(pointer('pointerdown', 200));
  surface.dispatchEvent(pointer('pointerup', 200 + dx));
}

beforeEach(() => {
  document.body.replaceChildren();
  document.body.className = '';
});

describe('the quest strip cycles through real pointer events', () => {
  it('advances on a tap and wraps at the end', () => {
    const rig = mountStrip();
    rig.controller.update([quest('a'), quest('b')]);
    expect(rig.title.textContent).toBe('Title a');

    swipe(rig.surface, 0);
    expect(rig.title.textContent).toBe('Title b');
    swipe(rig.surface, 0);
    expect(rig.title.textContent).toBe('Title a');
    // The tap confirms itself audibly, the same click every HUD control plays.
    expect(rig.click).toHaveBeenCalledTimes(2);
  });

  it('advances on a swipe LEFT and goes back on a swipe RIGHT, wrapping both ways', () => {
    const rig = mountStrip();
    rig.controller.update([quest('a'), quest('b'), quest('c')]);

    swipe(rig.surface, -SWIPE_PX);
    expect(rig.title.textContent).toBe('Title b');
    swipe(rig.surface, SWIPE_PX);
    expect(rig.title.textContent).toBe('Title a');
    // Backwards off the start lands on the LAST quest, not on nothing.
    swipe(rig.surface, SWIPE_PX);
    expect(rig.title.textContent).toBe('Title c');
  });

  it('advances on a bare click, the path assistive tech takes', () => {
    const rig = mountStrip();
    rig.controller.update([quest('a'), quest('b')]);
    rig.surface.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(rig.title.textContent).toBe('Title b');
  });

  it('does not double-cycle when a gesture is followed by its synthetic click', () => {
    const rig = mountStrip();
    rig.controller.update([quest('a'), quest('b'), quest('c')]);
    swipe(rig.surface, -SWIPE_PX);
    rig.surface.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(rig.title.textContent).toBe('Title b');
  });

  it('cycles nowhere with a single tracked quest, and hides the position hint', () => {
    const rig = mountStrip();
    rig.controller.update([quest('a')]);
    expect(document.getElementById('quest-strip-cycle')?.style.display).toBe('none');
    swipe(rig.surface, -SWIPE_PX);
    expect(rig.title.textContent).toBe('Title a');
    expect(rig.click).not.toHaveBeenCalled();
  });

  it('drops a gesture the button never sees through the window backstop', () => {
    const rig = mountStrip();
    rig.controller.update([quest('a'), quest('b')]);
    rig.surface.dispatchEvent(pointer('pointerdown', 200));
    expect(rig.surface.classList.contains('gesturing')).toBe(true);
    window.dispatchEvent(pointer('pointerup', 900));
    expect(rig.surface.classList.contains('gesturing')).toBe(false);
    // Dropped, not resolved: a release the strip never saw cycles nothing.
    expect(rig.title.textContent).toBe('Title a');
  });
});

describe('the quest strip renders one quest in full', () => {
  it('shows the position, every objective, and the overflow line past the cap', () => {
    const rig = mountStrip();
    const many = quest('a', QUEST_STRIP_MAX_OBJECTIVES + 2);
    rig.controller.update([many, quest('b')]);

    expect(rig.counter.textContent).toBe('1/2');
    const shown = rig.objectives.filter((el) => el.style.display !== 'none');
    expect(shown).toHaveLength(QUEST_STRIP_MAX_OBJECTIVES);
    expect(shown[0].textContent).toContain('Objective 0');
    expect(shown[0].textContent).toContain('0/3');
    // A met objective is marked done rather than dropped.
    expect(shown[3].classList.contains('done')).toBe(true);
    expect(rig.more.textContent).toBe('+2 more');
    expect(rig.more.style.display).not.toBe('none');
  });

  it('names the position and the action in its accessible name', () => {
    const rig = mountStrip();
    rig.controller.update([quest('a'), quest('b'), quest('c')]);
    const label = rig.surface.getAttribute('aria-label') ?? '';
    expect(label).toContain('1');
    expect(label).toContain('3');
    expect(label).toContain('Title a');
    // With nothing to cycle to the label drops the position instead of saying
    // "1 of 1" and promising a cycle that does nothing.
    rig.controller.update([quest('a')]);
    expect(rig.surface.getAttribute('aria-label')).not.toContain('1 of 1');
  });

  it('marks a quest that is ready to turn in', () => {
    const rig = mountStrip();
    const ready = { ...quest('a'), complete: true };
    const mark = document.getElementById('quest-strip-complete') as HTMLElement;
    rig.controller.update([quest('b')]);
    expect(mark.style.display).toBe('none');
    rig.controller.update([ready]);
    expect(mark.textContent).toBe('(Complete)');
    expect(mark.style.display).not.toBe('none');
  });

  it('hides itself with nothing tracked and comes back with the next quest', () => {
    const rig = mountStrip();
    rig.controller.update([]);
    expect(rig.root.classList.contains('empty')).toBe(true);
    rig.controller.update([quest('a')]);
    expect(rig.root.classList.contains('empty')).toBe(false);
  });

  it('holds the selection as the tracked set shrinks under it', () => {
    const rig = mountStrip();
    rig.controller.update([quest('a'), quest('b'), quest('c')]);
    swipe(rig.surface, -SWIPE_PX);
    swipe(rig.surface, -SWIPE_PX);
    expect(rig.title.textContent).toBe('Title c');
    // Turning in the first quest must not throw the player back to the top of
    // the list mid-fight; the index clamps to the new end instead.
    rig.controller.update([quest('a'), quest('b')]);
    expect(rig.title.textContent).toBe('Title b');
  });
});

describe('the tracker hands its projection to the strip on touch', () => {
  function progress(questId: string): QuestProgress {
    return {
      questId,
      state: 'active',
      counts: QUESTS[questId].objectives.map(() => 0),
    };
  }

  function mountTracker(entries: QuestProgress[]) {
    const rig = mountStrip();
    const element = document.createElement('div');
    element.id = 'quest-tracker';
    document.body.append(element);
    const questLog = new Map(entries.map((entry) => [entry.questId, entry]));
    const controller = new QuestTrackerController({
      element,
      document,
      world: () => ({ questLog }) as Pick<IWorld, 'questLog'>,
      settings: {
        available: () => true,
        collapsed: () => false,
        setCollapsed: () => {},
      },
      questTitle: (questId) => `title:${questId}`,
      objectiveLabel: (questId, index) => `objective:${questId}:${index}`,
      click: () => {},
    });
    return { ...rig, element, controller };
  }

  it('renders the strip and NOT the right-anchored markup while touch is live', () => {
    const rig = mountTracker([progress('q_wolves'), progress('q_boars')]);
    rig.controller.update();
    expect(rig.element.innerHTML).toBe('');
    expect(rig.title.textContent).toBe('title:q_wolves');
    expect(rig.counter.textContent).toBe('1/2');
  });

  it('renders the right-anchored markup and leaves the strip alone off touch', () => {
    const rig = mountTracker([progress('q_wolves')]);
    document.body.classList.remove('mobile-touch');
    rig.controller.update();
    expect(rig.element.innerHTML).toContain('title:q_wolves');
    expect(rig.root.classList.contains('empty')).toBe(true);
  });
});
