import type {
  MovementInputSessionState,
  MovementInputTimeline,
} from './movement_input_timeline_v2';

interface TimelineCounters {
  consumed: number;
  starved: number;
  extrapolated: number;
  discardedLate: number;
  dropped: number;
  resyncs: number;
}

export interface MovementTimelineCaptureTotals {
  movementConsumedTotal: number;
  movementStarvedTotal: number;
  movementExtrapolatedTotal: number;
  movementDiscardedLateTotal: number;
  movementDroppedTotal: number;
  movementResyncsTotal: number;
}

function delta(current: number, previous: number): number {
  return current >= previous ? current - previous : current;
}

export class MovementInputTimelineTickStats {
  lastConsumed = 0;
  lastStarved = 0;
  lastExtrapolated = 0;
  lastDiscardedLate = 0;
  lastDropped = 0;
  lastResyncs = 0;

  private movementConsumedTotal = 0;
  private movementStarvedTotal = 0;
  private movementExtrapolatedTotal = 0;
  private movementDiscardedLateTotal = 0;
  private movementDroppedTotal = 0;
  private movementResyncsTotal = 0;
  private readonly previousByTimeline = new WeakMap<MovementInputTimeline, TimelineCounters>();

  fold(sessions: Iterable<MovementInputSessionState>, capturing: boolean): void {
    let consumed = 0;
    let starved = 0;
    let extrapolated = 0;
    let discardedLate = 0;
    let dropped = 0;
    let resyncs = 0;
    for (const session of sessions) {
      const timeline = session.movementTimeline;
      if (session.movementWireVersion !== 2 || !timeline) continue;
      let previous = this.previousByTimeline.get(timeline);
      if (!previous) {
        previous = {
          consumed: 0,
          starved: 0,
          extrapolated: 0,
          discardedLate: 0,
          dropped: 0,
          resyncs: 0,
        };
        this.previousByTimeline.set(timeline, previous);
      }
      consumed += delta(timeline.consumed, previous.consumed);
      starved += delta(timeline.starved, previous.starved);
      extrapolated += delta(timeline.extrapolated, previous.extrapolated);
      discardedLate += delta(timeline.discardedLate, previous.discardedLate);
      dropped += delta(timeline.dropped, previous.dropped);
      resyncs += delta(timeline.resyncs, previous.resyncs);
      previous.consumed = timeline.consumed;
      previous.starved = timeline.starved;
      previous.extrapolated = timeline.extrapolated;
      previous.discardedLate = timeline.discardedLate;
      previous.dropped = timeline.dropped;
      previous.resyncs = timeline.resyncs;
    }
    this.lastConsumed = consumed;
    this.lastStarved = starved;
    this.lastExtrapolated = extrapolated;
    this.lastDiscardedLate = discardedLate;
    this.lastDropped = dropped;
    this.lastResyncs = resyncs;
    if (!capturing) return;
    this.movementConsumedTotal += consumed;
    this.movementStarvedTotal += starved;
    this.movementExtrapolatedTotal += extrapolated;
    this.movementDiscardedLateTotal += discardedLate;
    this.movementDroppedTotal += dropped;
    this.movementResyncsTotal += resyncs;
  }

  resetCapture(): void {
    this.movementConsumedTotal = 0;
    this.movementStarvedTotal = 0;
    this.movementExtrapolatedTotal = 0;
    this.movementDiscardedLateTotal = 0;
    this.movementDroppedTotal = 0;
    this.movementResyncsTotal = 0;
  }

  captureTotals(): MovementTimelineCaptureTotals {
    return {
      movementConsumedTotal: this.movementConsumedTotal,
      movementStarvedTotal: this.movementStarvedTotal,
      movementExtrapolatedTotal: this.movementExtrapolatedTotal,
      movementDiscardedLateTotal: this.movementDiscardedLateTotal,
      movementDroppedTotal: this.movementDroppedTotal,
      movementResyncsTotal: this.movementResyncsTotal,
    };
  }

  heartbeatTokens(): string {
    return `moveConsumed=${this.lastConsumed} moveStarved=${this.lastStarved} moveExtrapolated=${this.lastExtrapolated} moveLate=${this.lastDiscardedLate} moveDropped=${this.lastDropped} moveResyncs=${this.lastResyncs}`;
  }
}
