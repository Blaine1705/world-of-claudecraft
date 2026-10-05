// The Hollow Crypt wing bosses' player copy states the live mechanic
// (docs/design/tooltip-writing.md): every number in the dungeon finder's
// mechanic lines is the encounter tuning combat reads, so a retune that forgets
// the copy reds here. Also pins the finder listing itself (normal and heroic).

import { describe, expect, it } from 'vitest';
import { FINDER_ACTIVITIES } from '../src/sim/content/dungeon_finder';
import { ILVANE_TUNING, LADY_TUNING, MARROW_TUNING } from '../src/sim/encounters/hollow_crypt';
import { hudChromeStrings } from '../src/ui/i18n.catalog/hud_chrome';

const mech = hudChromeStrings.finder.mech as Record<string, string>;
const n = (v: number) => String(v);
const pct = (v: number) => `${Math.round(v * 100)} percent`;

describe('Hollow Crypt wing bosses: the finder listing', () => {
  it('lists each core on normal and adds the heroic line on heroic', () => {
    const normal = FINDER_ACTIVITIES.find((a) => a.id === 'hollow_crypt_normal');
    const heroic = FINDER_ACTIVITIES.find((a) => a.id === 'hollow_crypt_heroic');
    if (!normal || !heroic) throw new Error('no crypt activities');
    const by = (list: typeof normal.encounters, id: string) =>
      list.find((e) => e.mobId === id)?.mechanics ?? [];
    expect(by(normal.encounters, 'sexton_marrow')).toEqual([
      'crypt_shovelful',
      'crypt_measured_for_the_grave',
      'crypt_burial_toll',
    ]);
    expect(by(heroic.encounters, 'sexton_marrow')).toContain('crypt_marrow_heroic');
    expect(by(normal.encounters, 'rimeweb')).not.toContain('crypt_lady_heroic');
    expect(by(heroic.encounters, 'rimeweb')).toContain('crypt_lady_heroic');
    expect(by(heroic.encounters, 'cantor_ilvane')).toContain('crypt_ilvane_heroic');
    for (const a of [normal, heroic])
      for (const e of a.encounters) for (const m of e.mechanics) expect(mech[m], m).toBeTruthy();
  });
});

describe('Hollow Crypt wing bosses: the finder lines state the tuning', () => {
  it('Sexton Marrow', () => {
    const T = MARROW_TUNING;
    expect(mech.crypt_shovelful).toContain(`every ${n(T.shovelEvery)} seconds`);
    expect(mech.crypt_shovelful).toContain(`${n(T.shovelRange)} yard cone`);
    expect(mech.crypt_shovelful).toContain(
      `${pct(1 - T.shovelSlow)} slower movement for ${n(T.shovelSlowSeconds)} seconds`,
    );
    expect(T.shovelMult).toBe(1.5);
    expect(mech.crypt_measured_for_the_grave).toContain(`every ${n(T.measureEvery)} seconds`);
    expect(mech.crypt_measured_for_the_grave).toContain(`${n(T.markSeconds)} seconds later`);
    expect(mech.crypt_measured_for_the_grave).toContain(
      `${n(T.graveOpenMin)} to ${n(T.graveOpenMax)} damage within ${n(T.graveRadius)} yards`,
    );
    expect(mech.crypt_measured_for_the_grave).toContain(
      `${n(T.graveDirtPerSecond)} damage a second and ${pct(1 - T.graveSlow)} slower`,
    );
    expect(mech.crypt_burial_toll).toContain(
      `at ${pct(T.tollAt[0]).replace(' percent', '')} and ${pct(T.tollAt[1])} health`,
    );
    expect(mech.crypt_burial_toll).toContain(`rings for ${n(T.tollRing)} seconds`);
    expect(mech.crypt_burial_toll).toContain(`${n(T.tollMin)} to ${n(T.tollMax)} shadow damage`);
    expect(mech.crypt_marrow_heroic).toContain(`every ${n(T.blowEvery)} seconds`);
    expect(mech.crypt_marrow_heroic).toContain(
      `${pct(T.blowVulnPerStack)} more damage for ${n(T.blowSeconds)} seconds, up to ${n(T.blowMaxStacks)} stacks`,
    );
    expect(mech.crypt_marrow_heroic).toContain(`swings ${pct(T.graveVigorHaste - 1)} faster`);
    expect(mech.crypt_marrow_heroic).toContain(`stays ${n(T.unquietLinger)} seconds in a grave`);
  });

  it('the Lady of the Bonechill', () => {
    const T = LADY_TUNING;
    expect(mech.crypt_brides_lament).toContain(
      `every ${n(T.lamentEvery)} seconds a ${n(T.lamentCast)} second wail`,
    );
    expect(mech.crypt_brides_lament).toContain(
      `${n(T.lamentMin)} to ${n(T.lamentMax)} frost damage`,
    );
    expect(T.lingerPerStack).toBe(0.5);
    expect(mech.crypt_brides_lament).toContain('half again for every Lingering Lament stack');
    expect(T.lanternCap).toBe(2);
    expect(mech.crypt_brides_lament).toContain(`dark for ${n(T.lanternDark)} seconds`);
    expect(mech.crypt_frozen_embrace).toContain(`every ${n(T.embraceEvery)} seconds`);
    expect(mech.crypt_frozen_embrace).toContain(`rises ${n(T.embraceHeight)} yards`);
    expect(mech.crypt_frozen_embrace).toContain(`${n(T.embracePerSecond)} frost damage a second`);
    expect(mech.crypt_frozen_embrace).toContain(
      `deal ${pct(T.embraceBreakShare)} of her health within ${n(T.embraceHold)} seconds`,
    );
    expect(mech.crypt_frozen_embrace).toContain(`${n(T.dropMin)} to ${n(T.dropMax)} damage`);
    expect(mech.crypt_rime_path).toContain(`for ${n(T.rimeSeconds)} seconds`);
    expect(T.freezeAt).toBe(0.5);
    expect(mech.crypt_lady_heroic).toContain(
      `after ${n(T.lanternLitHeroic)} seconds and stays dark for ${n(T.lanternGutter)}`,
    );
    expect(T.embraceVictimsHeroic).toBe(2);
  });

  it('Cantor Ilvane', () => {
    const T = ILVANE_TUNING;
    expect(mech.crypt_dirge_of_the_hollow).toContain(
      `every ${n(T.dirgeEvery)} seconds a ${n(T.dirgeCast)} second song`,
    );
    expect(mech.crypt_dirge_of_the_hollow).toContain(
      `${n(T.dirgeMin)} to ${n(T.dirgeMax)} shadow damage`,
    );
    expect(mech.crypt_dirge_of_the_hollow).toContain(`${n(T.dirgeSilence)} second silence`);
    expect(mech.crypt_dirge_of_the_hollow).toContain(`within ${n(T.dirgeRadius)} yards`);
    expect(mech.crypt_harmony).toContain(`${pct(T.harmonyPer)} less damage`);
    expect(mech.crypt_bone_organ).toContain(`every ${n(T.organEvery)} seconds`);
    expect(mech.crypt_bone_organ).toContain(`${n(T.noteMin)} to ${n(T.noteMax)} damage`);
    expect(T.organWaveAt).toHaveLength(2);
    expect(mech.crypt_crescendo).toContain(`below ${pct(T.crescendoAt)} health`);
    expect(mech.crypt_crescendo).toContain(
      `takes ${n(T.dirgeCastCrescendo)} seconds and comes every ${n(T.dirgeEveryCrescendo)} seconds`,
    );
    expect(T.organWaveAtCrescendo).toHaveLength(3);
    expect(mech.crypt_ilvane_heroic).toContain(`lies dead for ${n(T.encoreSeconds)} seconds`);
    expect(T.unbrokenEvery).toBe(3);
  });
});
