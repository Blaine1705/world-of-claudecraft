import { describe, expect, it } from 'vitest';
import {
  WORLD_QUEST_CALLIGRAPHY_ADVANCED,
  WORLD_QUEST_CALLIGRAPHY_QUEST,
} from '../src/sim/content/world_quest_calligraphy';
import { createWorldQuestTrace, stepWorldQuestTrace } from '../src/sim/world_quest_trace_geometry';
import {
  sanitizeWorldQuestTraceVariant,
  worldQuestTraceShape,
  worldQuestTraceVariantForCycle,
} from '../src/sim/world_quest_trace_variants';

describe('deterministic advanced calligraphy variants', () => {
  it('selects stable cycle variants without consuming a simulation RNG', () => {
    const selected = Array.from({ length: 30 }, (_, i) =>
      worldQuestTraceVariantForCycle(`wq3_${6 + i * 7}`),
    );
    expect(new Set(selected)).toEqual(
      new Set(['star', 'hourglass', 'lightning', 'spiral', 'double-triangle']),
    );
    expect(selected).toEqual(
      Array.from({ length: 30 }, (_, i) => worldQuestTraceVariantForCycle(`wq3_${6 + i * 7}`)),
    );
    expect(sanitizeWorldQuestTraceVariant('future-rune', 'wq3_6')).toBe('future-rune');
    expect(worldQuestTraceShape(WORLD_QUEST_CALLIGRAPHY_QUEST, 2, 'future-rune')).toBeUndefined();
    expect(sanitizeWorldQuestTraceVariant({}, 'wq3_6')).toBe(
      worldQuestTraceVariantForCycle('wq3_6'),
    );
  });
  it.each(WORLD_QUEST_CALLIGRAPHY_ADVANCED)(
    'walks every edge of $kind in both directions',
    (shape) => {
      for (const reverse of [false, true]) {
        const points = reverse ? [...shape.points].reverse() : shape.points;
        const state = createWorldQuestTrace('q', shape, points[0], 0, 2);
        stepWorldQuestTrace(state, shape, points[0], 6);
        let time = 6;
        for (let edge = 1; edge < points.length; edge++) {
          const a = points[edge - 1];
          const b = points[edge];
          const samples = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
          for (let i = 1; i <= samples; i++) {
            time += 0.05;
            stepWorldQuestTrace(
              state,
              shape,
              { x: a.x + ((b.x - a.x) * i) / samples, z: a.z + ((b.z - a.z) * i) / samples },
              time,
            );
          }
        }
        expect(state, `${shape.kind} reverse=${reverse}`).toMatchObject({
          phase: 'success',
          segment: points.length - 1,
        });
        expect(state.trail.length).toBeLessThanOrEqual(256);
      }
    },
  );
});
