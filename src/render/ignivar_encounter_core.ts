import {
  IGNIVAR_BRAND_AURA_ID,
  IGNIVAR_FORGE_WAVE_CAST_ID,
  IGNIVAR_FRONTAL_CAST_ID,
  IGNIVAR_JUDGMENT_CAST_ID,
  IGNIVAR_LAST_INFERNO_AURA_ID,
  IGNIVAR_ROTATING_RAYS_CAST_ID,
  IGNIVAR_SKYFIRE_CAST_ID,
  IGNIVAR_SOAK_AURA_ID,
} from '../sim/encounters/ignivar';
import {
  type IgnivarJudgmentShelterIndex,
  ignivarForgeLayoutFromFacing,
} from '../sim/ignivar_forge_judgment';
import { ignivarForgeWaveRadius } from '../sim/ignivar_forge_wave';
import { IGNIVAR_BOSS_ID } from '../sim/types';

export type IgnivarVisualEntity = {
  id?: number;
  kind: string;
  templateId: string;
  castingAbility: string | null;
  castRemaining?: number;
  castTotal?: number;
  channeling?: boolean;
  facing?: number;
  auras: readonly { id: string; stacks?: number }[];
  scale?: number;
};

export interface IgnivarEncounterVisualPlan {
  frontalVisible: boolean;
  skyfireVisible: boolean;
  rotatingRaysVisible: boolean;
  judgmentPhase: 'hidden' | 'warning' | 'active';
  judgmentRotation: number;
  judgmentSafeIndex: IgnivarJudgmentShelterIndex;
  finalPhase: boolean;
  forgeWavePhase: 'hidden' | 'windup' | 'active';
  forgeWaveProgress: number;
  forgeWaveRadius: number;
  branded: boolean;
  soakMarked: boolean;
  brandStacks: number;
  brandFillOpacity: number;
  brandRimOpacity: number;
  inverseEntityScale: number;
}

/** Keeps arena-wide actionable visuals alive when the boss body leaves the camera frustum. */
export function ignivarEncounterBypassesCharacterCulling(entity: IgnivarVisualEntity): boolean {
  if (entity.templateId !== IGNIVAR_BOSS_ID) return false;
  return (
    entity.castingAbility === IGNIVAR_FRONTAL_CAST_ID ||
    entity.castingAbility === IGNIVAR_SKYFIRE_CAST_ID ||
    entity.castingAbility === IGNIVAR_ROTATING_RAYS_CAST_ID ||
    entity.castingAbility === IGNIVAR_FORGE_WAVE_CAST_ID ||
    entity.castingAbility === IGNIVAR_JUDGMENT_CAST_ID
  );
}

/** Pure per-frame presentation policy for Ignivar's encounter telegraphs. */
export function ignivarEncounterVisualPlan(
  entity: IgnivarVisualEntity,
): IgnivarEncounterVisualPlan {
  const brand =
    entity.kind === 'player'
      ? entity.auras.find((aura) => aura.id === IGNIVAR_BRAND_AURA_ID)
      : undefined;
  const brandStacks = Math.max(1, Math.min(3, brand?.stacks ?? 1));
  const forgeWaveVisible =
    entity.templateId === IGNIVAR_BOSS_ID && entity.castingAbility === IGNIVAR_FORGE_WAVE_CAST_ID;
  const forgeWavePhase = !forgeWaveVisible ? 'hidden' : entity.channeling ? 'active' : 'windup';
  const forgeWaveProgress = forgeWaveVisible
    ? Math.min(
        1,
        Math.max(0, 1 - (entity.castRemaining ?? 0) / Math.max(0.01, entity.castTotal ?? 0.01)),
      )
    : 0;
  const judgmentVisible =
    entity.templateId === IGNIVAR_BOSS_ID && entity.castingAbility === IGNIVAR_JUDGMENT_CAST_ID;
  const judgmentPhase = !judgmentVisible ? 'hidden' : entity.channeling ? 'active' : 'warning';
  const judgmentLayout = ignivarForgeLayoutFromFacing(judgmentVisible ? (entity.facing ?? 0) : 0);
  return {
    frontalVisible:
      entity.templateId === IGNIVAR_BOSS_ID && entity.castingAbility === IGNIVAR_FRONTAL_CAST_ID,
    skyfireVisible:
      entity.templateId === IGNIVAR_BOSS_ID && entity.castingAbility === IGNIVAR_SKYFIRE_CAST_ID,
    rotatingRaysVisible:
      entity.templateId === IGNIVAR_BOSS_ID &&
      entity.castingAbility === IGNIVAR_ROTATING_RAYS_CAST_ID,
    judgmentPhase,
    judgmentRotation: judgmentLayout.rotation,
    judgmentSafeIndex: judgmentLayout.safeIndex,
    finalPhase:
      entity.templateId === IGNIVAR_BOSS_ID &&
      entity.auras.some((aura) => aura.id === IGNIVAR_LAST_INFERNO_AURA_ID),
    forgeWavePhase,
    forgeWaveProgress,
    forgeWaveRadius:
      forgeWavePhase === 'active' ? ignivarForgeWaveRadius(entity.castRemaining ?? 0) : 0,
    branded: brand !== undefined,
    soakMarked:
      entity.kind === 'player' && entity.auras.some((aura) => aura.id === IGNIVAR_SOAK_AURA_ID),
    brandStacks,
    brandFillOpacity: 0.13 + (brandStacks - 1) * 0.06,
    brandRimOpacity: 0.8 + (brandStacks - 1) * 0.08,
    inverseEntityScale: 1 / Math.max(0.01, entity.scale ?? 1),
  };
}
