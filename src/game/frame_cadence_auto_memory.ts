// What the automatic Frame Rate Limit learned last session, so a weak machine
// does not rediscover it at every login. Keyed by what would make it wrong: the
// graphics preset and the display's refresh class. The preset is only ever a
// KEY here, an invalidation: it never decides a ceiling (the fairness guard,
// tests/frame_cadence_fairness.test.ts, keeps the deciding modules blind to
// it). A stale entry costs one return trial, so nothing finer is worth keying.

import type { FrameCeilingIntent } from './frame_cadence_core';
import { Settings } from './settings';

const AUTO_MEMORY_KEY = 'woc_frame_cadence_auto';

export interface FrameCadenceAutoMemory {
  load: (refreshHz: number) => FrameCeilingIntent | null;
  save: (refreshHz: number, ceiling: FrameCeilingIntent) => void;
}

export function frameCadenceAutoMemoryKey(preset: number, refreshHz: number): string {
  return `${preset}|${Math.round(refreshHz / 5) * 5}`;
}

function currentKey(refreshHz: number): string {
  let preset = -1;
  try {
    preset = new Settings().get('graphicsPreset');
  } catch {
    preset = -1;
  }
  return frameCadenceAutoMemoryKey(preset, refreshHz);
}

export const localFrameCadenceAutoMemory: FrameCadenceAutoMemory = {
  load: (refreshHz) => {
    try {
      const raw = JSON.parse(localStorage.getItem(AUTO_MEMORY_KEY) ?? 'null') as {
        key?: unknown;
        ceiling?: unknown;
      } | null;
      if (!raw || raw.key !== currentKey(refreshHz)) return null;
      return raw.ceiling === 30 || raw.ceiling === 60 || raw.ceiling === 0 ? raw.ceiling : null;
    } catch {
      return null;
    }
  },
  save: (refreshHz, ceiling) => {
    try {
      localStorage.setItem(
        AUTO_MEMORY_KEY,
        JSON.stringify({ key: currentKey(refreshHz), ceiling }),
      );
    } catch {
      /* storage unavailable */
    }
  },
};
