import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';

describe('expanded Ignivar raid visual manifest', () => {
  it('keeps only the unfinished Varkhul body on the visible elemental fallback', () => {
    expect(
      visualKeyFor({ kind: 'mob', templateId: 'varkhul_forgefather_of_the_last_flame' } as never),
    ).toBe('mob_elemental');
    expect(VISUALS.mob_elemental.url).toBe('models/creatures/golelingevolved.glb');
  });

  it('routes all three second-boss adds to their dedicated automa bodies and authored clips', () => {
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
        attackByAbility: { crucible_quake: 'JumpSlam' },
        attackTimeScaleByAbility: { crucible_quake: 0.8 },
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
        attack: ['Attack'],
        hit: ['Hit'],
        death: 'Death',
      },
    });
    expect(visualKeyFor({ kind: 'mob', templateId: 'ignivar_cinder_artificer' } as never)).toBe(
      'mob_ignivar_cinder_artificer',
    );
    expect(VISUALS.mob_ignivar_cinder_artificer).toMatchObject({
      url: 'models/creatures/cinder_artificer.glb',
      height: 2.1,
      yaw: 0,
      clips: {
        idle: 'Idle',
        walk: 'Walk',
        run: 'Run',
        attack: ['Attack'],
        attackByAbility: {
          cinder_recalibrate_start: 'ChannelStart',
          cinder_recalibrate_end: 'ChannelEnd',
        },
        cast: 'Channel',
        hit: ['Hit'],
        death: 'Death',
      },
    });
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
