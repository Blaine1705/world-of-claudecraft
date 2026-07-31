import type { Aura } from '../../../sim/types';

const DOOM_MAX = 100;
const WARNING_SECONDS = 5;

export interface DoomMeterState {
  visible: boolean;
  value: number;
  fillFrac: number;
  warning: boolean;
  ready: boolean;
  label: string;
  ariaValueText: string;
}

export interface DoomMeterInput {
  affliction: boolean;
  auras: readonly Aura[];
}

export function doomMeterState(
  input: DoomMeterInput,
  formatCount: (value: number) => string,
  formatEmptyStatus: (value: string, max: string) => string,
  formatStatus: (value: string, max: string, seconds: number) => string,
): DoomMeterState {
  const aura = input.auras.find((candidate) => candidate.kind === 'affliction_doom');
  const value = Math.max(0, Math.min(DOOM_MAX, Math.round(aura?.stacks ?? aura?.value ?? 0)));
  const remaining = Math.max(0, aura?.remaining ?? 0);
  const valueLabel = formatCount(value);
  const maxLabel = formatCount(DOOM_MAX);
  return {
    visible: input.affliction,
    value,
    fillFrac: value / DOOM_MAX,
    warning: value > 0 && remaining <= WARNING_SECONDS,
    ready: value >= DOOM_MAX,
    label: `${valueLabel} / ${maxLabel}`,
    ariaValueText:
      value > 0
        ? formatStatus(valueLabel, maxLabel, Math.ceil(remaining))
        : formatEmptyStatus(valueLabel, maxLabel),
  };
}
