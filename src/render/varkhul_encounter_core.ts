import {
  VARKHUL_ASSEMBLY_CORE_AURA_ID,
  VARKHUL_ASSEMBLY_FIXATE_AURA_ID,
  VARKHUL_ASSEMBLY_LINK_AURA_ID,
  VARKHUL_BOSS_ID,
  VARKHUL_CINDER_ORBS_AURA_ID,
  VARKHUL_MAKERS_BRAND_AURA_ID,
  VARKHUL_MAKERS_BRAND_MAX_STACKS,
} from '../sim/encounters/varkhul';
import { VARKHUL_FRONTAL_CAST_ID } from '../sim/varkhul_frontal';

export type VarkhulVisualEntity = {
  kind: string;
  templateId: string;
  scale?: number;
  castingAbility?: string | null;
  castRemaining?: number;
  castTotal?: number;
  auras: readonly {
    id: string;
    stacks?: number;
    remaining?: number;
    duration?: number;
    value?: number;
    charges?: number;
  }[];
};

export interface VarkhulEncounterVisualPlan {
  makersBrandStacks: number;
  cinderOrbsVisible: boolean;
  cinderOrbsProgress: number;
  frontalVisible: boolean;
  frontalProgress: number;
  fixateVisible: boolean;
  moltenCoreVisible: boolean;
  linkSymbol: number | null;
  linkRole: 'anvil' | 'hammer' | null;
  inverseEntityScale: number;
}

function auraProgress(aura: { remaining?: number; duration?: number } | undefined): number {
  if (!aura) return 0;
  return Math.min(
    1,
    Math.max(0, 1 - (aura.remaining ?? 0) / Math.max(0.01, aura.duration ?? 0.01)),
  );
}

/** Keeps actionable player marks alive even when their owning body is outside the frustum. */
export function varkhulEncounterBypassesCharacterCulling(entity: VarkhulVisualEntity): boolean {
  return (
    (entity.templateId === VARKHUL_BOSS_ID && entity.castingAbility === VARKHUL_FRONTAL_CAST_ID) ||
    (entity.kind === 'player' &&
      entity.auras.some((aura) =>
        [
          VARKHUL_CINDER_ORBS_AURA_ID,
          VARKHUL_ASSEMBLY_FIXATE_AURA_ID,
          VARKHUL_ASSEMBLY_CORE_AURA_ID,
          VARKHUL_ASSEMBLY_LINK_AURA_ID,
        ].includes(aura.id),
      ))
  );
}

/** Keeps the raid boss anchor available while its generated rig finishes compiling. */
export function varkhulEncounterViewVisibleDuringCompile(
  entity: VarkhulVisualEntity,
  compilePending: boolean,
): boolean {
  return (
    !compilePending ||
    entity.templateId === VARKHUL_BOSS_ID ||
    varkhulEncounterBypassesCharacterCulling(entity)
  );
}

export function varkhulEncounterVisualPlan(
  entity: VarkhulVisualEntity,
): VarkhulEncounterVisualPlan {
  const brand =
    entity.kind === 'player'
      ? entity.auras.find((aura) => aura.id === VARKHUL_MAKERS_BRAND_AURA_ID)
      : undefined;
  const cinderOrbs =
    entity.kind === 'player'
      ? entity.auras.find((aura) => aura.id === VARKHUL_CINDER_ORBS_AURA_ID)
      : undefined;
  const fixate = entity.auras.find((aura) => aura.id === VARKHUL_ASSEMBLY_FIXATE_AURA_ID);
  const moltenCore = entity.auras.find((aura) => aura.id === VARKHUL_ASSEMBLY_CORE_AURA_ID);
  const link = entity.auras.find((aura) => aura.id === VARKHUL_ASSEMBLY_LINK_AURA_ID);
  const frontalVisible =
    entity.templateId === VARKHUL_BOSS_ID && entity.castingAbility === VARKHUL_FRONTAL_CAST_ID;
  return {
    makersBrandStacks: brand
      ? Math.max(1, Math.min(VARKHUL_MAKERS_BRAND_MAX_STACKS, brand.stacks ?? 1))
      : 0,
    cinderOrbsVisible: cinderOrbs !== undefined,
    cinderOrbsProgress: auraProgress(cinderOrbs),
    frontalVisible,
    frontalProgress: frontalVisible
      ? Math.min(
          1,
          Math.max(0, 1 - (entity.castRemaining ?? 0) / Math.max(0.01, entity.castTotal ?? 0.01)),
        )
      : 0,
    fixateVisible: fixate !== undefined,
    moltenCoreVisible: moltenCore !== undefined,
    linkSymbol: link ? Math.max(0, Math.min(4, Math.floor((link.stacks ?? 1) - 1))) : null,
    linkRole: link ? (link.charges === 2 ? 'hammer' : 'anvil') : null,
    inverseEntityScale: 1 / Math.max(0.01, entity.scale ?? 1),
  };
}
