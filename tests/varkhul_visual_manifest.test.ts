import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';

describe('expanded Ignivar raid visual manifest', () => {
  it('keeps only unfinished Varkhul bodies on the visible elemental fallback', () => {
    for (const templateId of [
      'ignivar_cinder_artificer',
      'varkhul_forgefather_of_the_last_flame',
    ]) {
      expect(visualKeyFor({ kind: 'mob', templateId } as never)).toBe('mob_elemental');
    }
    expect(VISUALS.mob_elemental.url).toBe('models/creatures/golelingevolved.glb');
  });

  it('routes both second-boss adds to their dedicated automa bodies', () => {
    expect(visualKeyFor({ kind: 'mob', templateId: 'ignivar_crucible_warden' } as never)).toBe(
      'mob_ignivar_crucible_warden',
    );
    expect(visualKeyFor({ kind: 'mob', templateId: 'ignivar_ember_sentinel' } as never)).toBe(
      'mob_ignivar_ember_sentinel',
    );
    expect(VISUALS.mob_ignivar_crucible_warden).toMatchObject({
      url: 'models/creatures/crucible_warden.glb',
      height: 2.2,
      yaw: 0,
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        run: 'Run',
        attack: ['Attack'],
        hit: ['Hit'],
        death: 'Death',
      },
    });
    expect(VISUALS.mob_ignivar_ember_sentinel).toMatchObject({
      url: 'models/creatures/ember_sentinel.glb',
      height: 2.3,
      yaw: 0,
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        run: 'Run',
        attack: ['Hit'],
        death: 'Death',
      },
    });
    expect(VISUALS.mob_ignivar_ember_sentinel.clips.hit).toBeUndefined();
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
