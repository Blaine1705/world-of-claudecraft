import type { WorldQuestDef, WorldQuestTraceDef } from './types';

/** Append-only identifiers: saved variants never depend on a reordered table index. */
export const WORLD_QUEST_TRACE_VARIANTS = [
  'star',
  'hourglass',
  'lightning',
  'spiral',
  'double-triangle',
] as const;

export function worldQuestTraceVariantForCycle(cycle: string): string {
  let hash = 2166136261;
  for (let i = 0; i < cycle.length; i++) hash = Math.imul(hash ^ cycle.charCodeAt(i), 16777619);
  return WORLD_QUEST_TRACE_VARIANTS[(hash >>> 0) % WORLD_QUEST_TRACE_VARIANTS.length];
}

/** Unknown future identifiers fail closed, never silently changing a saved puzzle. */
export function worldQuestTraceShape(
  quest: WorldQuestDef,
  shapeIndex: number,
  variant?: string,
): WorldQuestTraceDef | undefined {
  if (quest.objective.type !== 'tracing' || !Number.isSafeInteger(shapeIndex) || shapeIndex < 0)
    return undefined;
  if (shapeIndex !== quest.objective.shapes.length - 1) return quest.objective.shapes[shapeIndex];
  if (variant === undefined) return quest.objective.shapes[shapeIndex];
  return quest.objective.advancedShapes?.find((shape) => shape.kind === variant);
}

export function sanitizeWorldQuestTraceVariant(value: unknown, cycle: string): string {
  // Preserve bounded future release IDs through an older binary. The resolver
  // refuses unsupported IDs until that host understands their authored outline.
  return typeof value === 'string' && /^[a-z][a-z-]{0,31}$/.test(value)
    ? value
    : worldQuestTraceVariantForCycle(cycle);
}
