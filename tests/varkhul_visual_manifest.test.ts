import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';

const AUTOMATA = [
  'ignivar_ember_sentinel',
  'ignivar_crucible_warden',
  'ignivar_cinder_artificer',
] as const;

describe('expanded Ignivar raid visual manifest', () => {
  it('keeps unfinished Varkhul bodies on the visible elemental fallback', () => {
    for (const templateId of [...AUTOMATA, 'varkhul_forgefather_of_the_last_flame']) {
      expect(visualKeyFor({ kind: 'mob', templateId } as never)).toBe('mob_elemental');
    }
    expect(VISUALS.mob_elemental.url).toBe('models/creatures/golelingevolved.glb');
  });

  it('reuses the established archivist body for Maelin Emberward', () => {
    const maelin = visualKeyFor({
      kind: 'npc',
      templateId: 'archivist_maelin_emberward',
    } as never);
    const tullo = visualKeyFor({ kind: 'npc', templateId: 'archivist_tullo' } as never);
    expect(maelin).toBe(tullo);
    expect(maelin).toBe('npc_villager_robed');
  });
});
