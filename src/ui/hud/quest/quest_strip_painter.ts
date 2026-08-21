// Thin painter for the touch quest strip: the title row, the objective lines,
// the counter hint and the strip's seat in the top band.
//
// It renders an already-localized model. The controller owns the t() calls and
// the formatting (a painter that reached for t() would make the strip's text
// untestable without a locale loaded), the pure core owns the arithmetic, and
// every write here routes through the injected PainterHostWriters, so an
// unchanged frame costs no DOM mutation at all.
//
// The objective rows are STATIC markup (index.html / play.html carry
// QUEST_STRIP_MAX_OBJECTIVES of them plus the overflow line), never minted here:
// the strip repaints on the HUD's medium band and a pooled build would be one
// more thing to get wrong for a list that is capped at five lines anyway.
//
// It takes no layout read: the seat comes in already measured from the
// controller, which gates its measures behind a cheap invalidation key.

import type { PainterHostWriters } from '../../painter_host';
import type { QuestStripBand, QuestStripStep } from './quest_strip_core';

const CLASS_EMPTY = 'empty';
const CLASS_DONE = 'done';
const CLASS_COMPLETE = 'complete';
const CLASS_PRESSED = 'gesturing';
const LEFT_PROP = 'left';
const TOP_PROP = 'top';
const MAX_WIDTH_PROP = 'max-width';
const ARIA_LABEL_ATTR = 'aria-label';
const HIDDEN = 'none';
const SHOWN = '';

/** The chevron pulse that confirms a cycle: the gesture confirms itself, which
 *  is how a player learns that the swipe did the thing. Two alternating classes
 *  rather than one, because re-triggering the SAME class does not restart a CSS
 *  animation and the only other way to force it is a reflow read. */
const FLASH_CLASSES = ['flash-a', 'flash-b'] as const;

export interface QuestStripFlash {
  step: QuestStripStep;
  /** Alternates 0/1 per cycle so a repeated step still restarts the pulse. */
  phase: 0 | 1;
}

export interface QuestStripObjectiveLine {
  /** Already-localized "label current/total" line. */
  text: string;
  done: boolean;
}

/** Everything the painter renders, all of it already localized. */
export interface QuestStripPaintModel {
  visible: boolean;
  title: string;
  complete: boolean;
  /** The "(Complete)" marker's text; only rendered while `complete`. */
  completeLabel: string;
  /** The "2/3" position hint, and whether there is anything to cycle to. */
  counter: string;
  counterVisible: boolean;
  /** The button's accessible name: position, title and what activating does. */
  aria: string;
  objectives: readonly QuestStripObjectiveLine[];
  /** The "+N more" overflow line, or '' when nothing was trimmed. */
  more: string;
  pressed: boolean;
  flash: QuestStripFlash | null;
}

export interface QuestStripPaintDescriptor {
  /** #quest-strip, the seated root. */
  root: HTMLElement;
  /** #quest-strip-main, the button that owns the press. */
  surface: HTMLElement;
  title: HTMLElement;
  completeMark: HTMLElement;
  cycleHint: HTMLElement;
  counter: HTMLElement;
  prevArrow: HTMLElement;
  nextArrow: HTMLElement;
  /** The static objective lines, in order. */
  objectives: readonly HTMLElement[];
  /** The "+N more" line that follows them. */
  more: HTMLElement;
}

export class QuestStripPainter {
  constructor(
    private readonly writers: PainterHostWriters,
    private readonly descriptor: QuestStripPaintDescriptor,
  ) {}

  paint(model: QuestStripPaintModel): void {
    const d = this.descriptor;
    this.writers.toggleClass(d.root, CLASS_EMPTY, !model.visible);
    if (!model.visible) return;

    this.writers.setText(d.title, model.title);
    this.writers.toggleClass(d.title, CLASS_COMPLETE, model.complete);
    this.writers.setText(d.completeMark, model.completeLabel);
    this.writers.setDisplay(d.completeMark, model.complete ? SHOWN : HIDDEN);

    this.writers.setDisplay(d.cycleHint, model.counterVisible ? SHOWN : HIDDEN);
    this.writers.setText(d.counter, model.counter);

    for (let i = 0; i < d.objectives.length; i++) {
      const line = model.objectives[i];
      const el = d.objectives[i];
      this.writers.setDisplay(el, line ? SHOWN : HIDDEN);
      if (!line) continue;
      this.writers.setText(el, line.text);
      this.writers.toggleClass(el, CLASS_DONE, line.done);
    }
    this.writers.setText(d.more, model.more);
    this.writers.setDisplay(d.more, model.more === '' ? HIDDEN : SHOWN);

    this.writers.setAttr(d.surface, ARIA_LABEL_ATTR, model.aria);
    this.writers.toggleClass(d.surface, CLASS_PRESSED, model.pressed);
    this.paintFlash(model.flash);
  }

  /** Seat the strip at the band the core resolved. Left-top anchored, so a
   *  changing objective count grows the box down and right instead of moving
   *  the point the player's eye (and thumb) already learned. */
  place(band: QuestStripBand): void {
    const { root } = this.descriptor;
    this.writers.setStyleProp(root, LEFT_PROP, `${band.left}px`);
    this.writers.setStyleProp(root, TOP_PROP, `${band.top}px`);
    this.writers.setStyleProp(root, MAX_WIDTH_PROP, `${band.maxWidth}px`);
  }

  private paintFlash(flash: QuestStripFlash | null): void {
    const { prevArrow, nextArrow } = this.descriptor;
    const lit = flash === null ? null : flash.step > 0 ? nextArrow : prevArrow;
    for (const el of [prevArrow, nextArrow]) {
      for (const [phase, cls] of FLASH_CLASSES.entries()) {
        this.writers.toggleClass(el, cls, el === lit && flash?.phase === phase);
      }
    }
  }
}
