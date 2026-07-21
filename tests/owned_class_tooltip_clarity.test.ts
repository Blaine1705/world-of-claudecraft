import { describe, expect, it } from 'vitest';
import {
  HUNTER_CHOICE_ROWS,
  PRIEST_CHOICE_ROWS,
  SHAMAN_CHOICE_ROWS,
} from '../src/sim/content/choice_rows_classic';
import { ABILITIES } from '../src/sim/data';

const OWNED_CLASSES = new Set(['hunter', 'shaman', 'priest']);
const VAGUE_ABILITY_COPY =
  /primary wound|calculated healing|become unsafe|valid .* impacts|normal rotation/i;
const VAGUE_TALENT_COPY =
  /spec relationships?|specialization-specific throughput|selected specialization spirit|^Grants [^.]+\.$/i;

describe('owned-class English tooltip clarity', () => {
  it('does not hide spell rules behind vague implementation language', () => {
    const failures = Object.values(ABILITIES)
      .filter((ability) => OWNED_CLASSES.has(ability.class))
      .filter((ability) => VAGUE_ABILITY_COPY.test(ability.description))
      .map((ability) => `${ability.id}: ${ability.description}`);

    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('explains granted actions and spec-specific talent outcomes', () => {
    const failures = [HUNTER_CHOICE_ROWS, SHAMAN_CHOICE_ROWS, PRIEST_CHOICE_ROWS]
      .flatMap((tree) => tree.rows)
      .flatMap((row) => row.options)
      .filter((option) => VAGUE_TALENT_COPY.test(option.description))
      .map((option) => `${option.id}: ${option.description}`);

    expect(failures, failures.join('\n')).toEqual([]);
  });
});
