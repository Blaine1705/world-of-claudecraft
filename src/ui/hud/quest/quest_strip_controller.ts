// Builds and drives the touch quest strip: the top-band, one-quest-at-a-time
// replacement for the right-anchored tracker on phones (Phase 5 of the touch
// rework).
//
// The tracker it replaces is fixed-width per tier and UNBOUNDED in height, so
// every extra quest grows it downward into the action ring (measured: 122 x 42px
// of overlap at only two quests). The strip shows ONE quest with all of its
// objectives in the band the collapsed button row vacated, which makes its
// height a function of one quest's objective count rather than of the whole log.
//
// It is a second PRESENTATION of the tracked quests, never a second data model:
// QuestTrackerController hands it the same TrackedQuest[] it renders on desktop,
// which is why no IWorld member was added for it.
//
// The ANCHOR is authored, not measured: hud.mobile.css derives
// --quest-strip-anchor-left per tier from the target frame's own static seat, so
// the strip sits where it would sit beside a target whether or not the player
// has one. Measuring that frame is what used to slide the strip sideways every
// time a target came or went. What is left here is the one genuinely dynamic
// half, the WIDTH: the buff bars grow leftward and the minimap's zone label is
// as wide as the zone's name, so how far the strip may run before it reaches
// them is measured. Everything else (size, type scale, the constant hit pad) is
// CSS in hud.mobile.css, per tier.

import { formatNumber, t } from '../../i18n';
import type { PainterHostWriters } from '../../painter_host';
import {
  cycleQuestStrip,
  QUEST_STRIP_FALLBACK_HEIGHT_PX,
  type QuestStripBox,
  type QuestStripStep,
  type QuestStripView,
  questStripBand,
  questStripView,
} from './quest_strip_core';
import { QuestStripGesture } from './quest_strip_gesture_controller';
import {
  type QuestStripFlash,
  type QuestStripObjectiveLine,
  type QuestStripPaintDescriptor,
  QuestStripPainter,
} from './quest_strip_painter';
import type { TrackedQuest } from './quest_tracker';

const ROOT_ID = 'quest-strip';
const SURFACE_ID = 'quest-strip-main';
const TITLE_ID = 'quest-strip-title';
const COMPLETE_ID = 'quest-strip-complete';
const CYCLE_ID = 'quest-strip-cycle';
const COUNT_ID = 'quest-strip-count';
const PREV_ID = 'quest-strip-prev';
const NEXT_ID = 'quest-strip-next';
const MORE_ID = 'quest-strip-more';
const HINT_ID = 'quest-strip-hint';
const OBJECTIVE_SELECTOR = '.quest-strip-obj:not(.quest-strip-more)';
/** The strip only exists on the touch HUD; desktop keeps its tracker. */
const TOUCH_BODY_CLASS = 'mobile-touch';

/**
 * Everything that can legitimately share the top band, each measured and only
 * counted while it overlaps the strip's own rows AND starts right of the
 * anchor, so one of them can cap the strip's width but none can move it.
 * #target-frame is deliberately absent: the anchor is derived from its STATIC
 * seat in CSS, so reading its live box could only reintroduce the jump. The
 * menu strip is absent too, and that one is load-bearing: it is a full-viewport
 * overlay while open, so measuring it would starve the strip of width every
 * time the player opened the menu.
 */
const BAND_OCCUPANT_SELECTORS = [
  '#party-frames',
  '#buff-bar',
  '#debuff-bar',
  '#minimap-wrap',
  '#right-tracker-stack',
] as const;

export interface QuestStripDeps {
  /** The HUD's click sound, played on a cycle so the tap confirms itself. */
  click(): void;
  /**
   * Hud's shared write-elision facet, handed down by QuestTrackerController. The
   * strip paints on the tracker's medium band, so its writes belong in the
   * coordinator's caches and its skips in the coordinator's skip-rate: a private
   * facet here would be a second write cache inside a domain, which
   * src/ui/hud/CLAUDE.md forbids for exactly this reason.
   */
  writers: PainterHostWriters;
}

/** The strip's static markup, resolved once at build. Identical in shape to the
 *  painter's descriptor, which is built straight from it. */
export type QuestStripElements = QuestStripPaintDescriptor;

function box(el: Element): QuestStripBox {
  const rect = el.getBoundingClientRect();
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
}

/** Owns the selection, the localized render model, and the gated band measure. */
export class QuestStripController {
  private quests: readonly TrackedQuest[] = [];
  private index = 0;
  private pressed = false;
  private flash: QuestStripFlash | null = null;
  private flashPhase: 0 | 1 = 0;
  /** The last painted content, so an unchanged medium-band tick paints nothing
   *  and the gated measure below stays untouched. Built from the RENDERED
   *  strings, so a locale change repaints without a relocalize hook. */
  private signature = '';
  private seatKey = '';

  private readonly painter: QuestStripPainter;
  private readonly gesture: QuestStripGesture;

  constructor(
    private readonly els: QuestStripElements,
    private readonly deps: QuestStripDeps,
    // Injectable so a Node test can drive the seat gating without a real window;
    // the default is the live one.
    private readonly win: Pick<Window, 'innerWidth' | 'innerHeight'> = window,
  ) {
    this.painter = new QuestStripPainter(deps.writers, els);
    this.gesture = new QuestStripGesture({
      surface: els.surface,
      cycle: (step) => this.cycle(step),
      setPressed: (pressed) => {
        this.pressed = pressed;
        this.repaint();
      },
    });
    this.gesture.attach();
  }

  /** True while the strip is the surface in use, which is what tells the
   *  tracker to stop rendering its own (CSS-hidden) markup on touch. */
  active(): boolean {
    return this.els.root.ownerDocument.body?.classList.contains(TOUCH_BODY_CLASS) === true;
  }

  /** Take the tracked quests the tracker already projected. The selection is
   *  CLAMPED rather than reset, so completing a quest does not throw the player
   *  back to the first one mid-fight. */
  update(quests: readonly TrackedQuest[]): void {
    this.quests = quests;
    this.repaint();
  }

  /** Move the selection, wrapping in both directions. */
  cycle(step: QuestStripStep): void {
    if (this.quests.length < 2) return;
    this.index = cycleQuestStrip(this.index, step, this.quests.length);
    this.flashPhase = this.flashPhase === 0 ? 1 : 0;
    this.flash = { step, phase: this.flashPhase };
    this.deps.click();
    this.repaint();
  }

  private repaint(): void {
    const view = questStripView(this.quests, this.index);
    this.index = view.index;
    const objectives = view.objectives.map<QuestStripObjectiveLine>((objective) => ({
      text: t('questUi.detail.objectiveProgress', {
        label: objective.label,
        current: this.number(objective.current),
        total: this.number(objective.total),
      }),
      done: objective.done,
    }));
    const model = {
      visible: view.visible,
      title: view.title,
      complete: view.complete,
      completeLabel: view.complete ? `(${t('questUi.tracker.complete')})` : '',
      counter: view.counter.visible
        ? t('hudChrome.mobile.questStripCounter', {
            position: this.number(view.counter.position),
            total: this.number(view.counter.total),
          })
        : '',
      counterVisible: view.counter.visible,
      hint: this.hintText(view),
      objectives,
      more:
        view.hiddenObjectives > 0
          ? t('hudChrome.mobile.questStripMore', { count: this.number(view.hiddenObjectives) })
          : '',
      pressed: this.pressed,
      flash: this.flash,
    };
    // The signature covers every rendered string, so a locale swap repaints even
    // when the numbers behind it did not move.
    const signature = [
      model.visible ? '1' : '0',
      model.title,
      model.completeLabel,
      model.counter,
      model.hint,
      model.more,
      ...objectives.map((line) => `${line.done ? '1' : '0'}${line.text}`),
    ].join('\u0000');
    const changed = signature !== this.signature;
    this.signature = signature;
    // The press and the chevron pulse are transient, so they always paint; the
    // content behind them rides the elided writers either way.
    this.painter.paint(model);
    if (changed || this.seatKey === '') this.seat();
  }

  /** The off-screen description: what the strip is and what activating it does.
   *  The visible chevrons are a HINT rather than buttons, so the sentence is the
   *  only place the cycle action is spelled out. */
  private hintText(view: QuestStripView): string {
    if (!view.visible) return '';
    if (!view.counter.visible)
      return t('hudChrome.mobile.questStripAriaSingle', { title: view.title });
    return t('hudChrome.mobile.questStripAria', {
      position: this.number(view.counter.position),
      total: this.number(view.counter.total),
      title: view.title,
    });
  }

  private number(value: number): string {
    return formatNumber(value, { maximumFractionDigits: 0 });
  }

  /**
   * Measure the band and bound the strip's width. Gated behind a key built only
   * from non-layout reads, so a steady HUD costs no rect read at all; it runs on
   * a content change (the strip's own box moved) or a layout change (viewport,
   * tier, UI scale). The target frame is not in the key, which is the point:
   * neither its class nor its style may change what this writes.
   */
  private seat(): void {
    const doc = this.els.root.ownerDocument;
    const key = [
      this.signature,
      this.win.innerWidth,
      this.win.innerHeight,
      doc.body?.getAttribute('class') ?? '',
      doc.documentElement.getAttribute('style') ?? '',
    ].join('|');
    if (key === this.seatKey) return;

    // The strip is seated inside #mobile-controls, which is sized from the
    // shared app-viewport box, so the container's own box is both the clamp
    // width and the origin every measured rect converts against.
    const container = this.els.root.parentElement;
    if (!container) return;
    const origin = box(container);
    const width = origin.right - origin.left;
    if (width <= 0) return;
    const shift = (measured: QuestStripBox): QuestStripBox => ({
      left: measured.left - origin.left,
      right: measured.right - origin.left,
      top: measured.top - origin.top,
      bottom: measured.bottom - origin.top,
    });
    // The anchor is READ, never written: the stylesheet owns it, and reading it
    // back is what lets the width be expressed from the same origin as the
    // occupants. Writing only a max-width cannot move it, so there is no loop.
    const own = shift(box(this.els.root));
    // Nothing tracked yet, so the strip is display:none and its box is at the
    // origin. Leaving without latching keeps a bogus bound off it and lets the
    // first real quest seat it properly.
    if (own.right - own.left <= 0) return;

    const occupants: QuestStripBox[] = [];
    for (const selector of BAND_OCCUPANT_SELECTORS) {
      const el = doc.querySelector(selector);
      if (!el) continue;
      const measured = shift(box(el));
      if (measured.right - measured.left <= 0) continue;
      occupants.push(measured);
    }
    this.painter.place(
      questStripBand({
        viewportWidth: width,
        anchorLeft: own.left,
        occupants,
        // The lane is the CONSTANT band height, deliberately not the strip's
        // own measured box: the box grows downward with the tracked quest's
        // objective count, so feeding that back in would let an occupant start
        // capping the width mid-flight as the objective list changed.
        stripHeight: QUEST_STRIP_FALLBACK_HEIGHT_PX,
      }),
    );
    // Latched only on a seat that actually happened: an early return above (a
    // container with no box yet, before the touch HUD is laid out) must leave
    // the next tick free to try again rather than remembering the attempt.
    this.seatKey = key;
  }
}

/** Build the strip, or return null when the markup is absent (a build that omits
 *  it, or a Node test with no document at all). */
export function buildQuestStrip(deps: QuestStripDeps): QuestStripController | null {
  if (typeof document === 'undefined') return null;
  const root = document.getElementById(ROOT_ID);
  const surface = document.getElementById(SURFACE_ID);
  const title = document.getElementById(TITLE_ID);
  const completeMark = document.getElementById(COMPLETE_ID);
  const cycleHint = document.getElementById(CYCLE_ID);
  const counter = document.getElementById(COUNT_ID);
  const prevArrow = document.getElementById(PREV_ID);
  const nextArrow = document.getElementById(NEXT_ID);
  const more = document.getElementById(MORE_ID);
  const hint = document.getElementById(HINT_ID);
  if (!root || !surface || !title || !completeMark || !cycleHint) return null;
  if (!counter || !prevArrow || !nextArrow || !more || !hint) return null;
  const objectives = [...root.querySelectorAll<HTMLElement>(OBJECTIVE_SELECTOR)];
  if (objectives.length === 0) return null;
  return new QuestStripController(
    {
      root,
      surface,
      title,
      completeMark,
      cycleHint,
      counter,
      prevArrow,
      nextArrow,
      objectives,
      more,
      hint,
    },
    deps,
  );
}
