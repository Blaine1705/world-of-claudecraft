import { describe, expect, it } from 'vitest';
import { CAMPS, MOBS, ZONES, zoneContaining } from '../src/sim/data';
import {
  BASE_TIER_WEIGHTS,
  HARVEST_TIERS,
  harvestFamilyYieldsItem,
  harvestTierQuantity,
  isHarvestableCorpse,
} from '../src/sim/professions/gathering';

// Profession harvesting (issue #1140): mob content records may carry an optional
// `componentTags` list (skinning/salvage component types like 'hide', 'horn',
// 'venomSac', 'gills', 'fang', 'claw'). This is data-as-code validation only:
// later profession-harvest issues (#1141+) consume the tags, so completeness
// across every mob is explicitly out of scope for this issue. What we do
// guarantee here is that every tag that DOES exist is well-formed.
describe('mob component-type tags', () => {
  const tagged = Object.values(MOBS).filter(
    (mob) => Array.isArray(mob.componentTags) && mob.componentTags.length > 0,
  );

  it('has tagged at least one mob (a representative sample across zones)', () => {
    expect(tagged.length).toBeGreaterThan(0);
  });

  it('every componentTags entry is a non-empty string with no duplicates', () => {
    for (const mob of tagged) {
      const tags = mob.componentTags ?? [];
      for (const tag of tags) {
        expect(typeof tag).toBe('string');
        expect(tag.trim().length).toBeGreaterThan(0);
      }
      const unique = new Set(tags);
      expect(unique.size, `${mob.id} has duplicate componentTags: ${tags.join(', ')}`).toBe(
        tags.length,
      );
    }
  });

  it('names every template whose tags ALL miss the yield table (#2513)', () => {
    // A content-author-facing pin, deliberately in the tag validator rather than
    // only in the harvest suites: tagging a template with nothing but claw, tusk,
    // gills or horn does NOT give it a harvest. isHarvestableCorpse answers on
    // the MAPPED families a template carries, so such a corpse is never offered
    // one and an explicit command is refused, exactly like an untagged template.
    // That is the settled ruling, not a bug, but it is easy to author by accident,
    // so a new one has to be added here on purpose.
    const allUnmapped = tagged
      .filter((mob) => !isHarvestableCorpse(mob.componentTags))
      .map((mob) => mob.id)
      .sort();
    expect(allUnmapped).toEqual(['fen_troll']);
    // The complement, so an always-false predicate could not pass the row above
    // by emptying the sweep. The Drakelands brood, zones 1 to 3 quest-dedupe
    // content, the Drakelands/Willowfen/Evergarden harvest-gap fix, and the
    // Galecrest scuttler reachability fix bring the harvestable tagged corpus to
    // 44. fen_troll is still the only all-unmapped one.
    expect(tagged.filter((mob) => isHarvestableCorpse(mob.componentTags))).toHaveLength(44);
  });

  it('never lets a template out-pay the tag list it advertises (#2514)', () => {
    // The knock-on of the #2514 ruling, made a checked property instead of an
    // accident of current content. The concentration bonus counts families the
    // harvest could not EXTRACT, and the denominator is the corpse's advertised
    // tag count, so an unmapped tag is worth a tier to whoever concentrates.
    // That widens the default harvest on a mixed corpse, and it is bounded only
    // by shape: the default pick extracts `mapped` families at bonus
    // `tags - mapped`, while the same corpse with every tag mapped would extract
    // `tags` at bonus 0. Below M=3 the first is the smaller number; at 3 mapped
    // families beside 1 unmapped it overtakes, and a template shaped that way
    // would quietly pay MORE for missing content than for shipped content.
    //
    // No shipped template has that shape (the widest mixed one is 2 mapped
    // beside 1 unmapped), so this reds on the first one that does, which is the
    // moment the ruling owes a second look rather than a silent buff. Derived
    // from BASE_TIER_WEIGHTS, so a weight tune moves the threshold with it
    // instead of leaving a stale hand-computed number behind.
    const expectedQty = (bonus: number) => {
      const total = BASE_TIER_WEIGHTS.reduce((sum, w) => sum + w, 0);
      // qty is tier index + 1, and the bonus shifts the index up, clamped at
      // the top tier (rollFocusTier + harvestTierQuantity).
      return BASE_TIER_WEIGHTS.reduce(
        (sum, w, i) => sum + (w / total) * (Math.min(BASE_TIER_WEIGHTS.length - 1, i + bonus) + 1),
        0,
      );
    };
    // The formula really does reward concentration, or every row below would
    // pass against a flat curve.
    expect(expectedQty(1)).toBeGreaterThan(expectedQty(0));
    // `expectedQty` mirrors two rules it cannot import: harvestTierQuantity's
    // `index + 1`, and rollFocusTier's clamp at the top tier. Both are pinned
    // against the shipped accessors here, so a change to either reds this guard
    // instead of leaving it quietly checking the wrong threshold. Every index,
    // not just the endpoints: a non-linear quantity table with the same first
    // and last values (say [1, 2, 2, 4, 5, 6]) would leave an endpoint pin
    // green while the threshold arithmetic below drifted.
    expect(HARVEST_TIERS).toHaveLength(BASE_TIER_WEIGHTS.length);
    expect(HARVEST_TIERS.map(harvestTierQuantity)).toEqual(BASE_TIER_WEIGHTS.map((_, i) => i + 1));
    let mixedSeen = 0;
    for (const mob of tagged) {
      const tags = mob.componentTags ?? [];
      const mapped = tags.filter((t) => harvestFamilyYieldsItem(t));
      if (mapped.length === 0 || mapped.length === tags.length) continue;
      mixedSeen++;
      const defaultPick = mapped.length * expectedQty(tags.length - mapped.length);
      const fullyMapped = tags.length * expectedQty(0);
      expect(defaultPick, `${mob.id} (${tags.join(', ')})`).toBeLessThanOrEqual(fullyMapped);
    }
    // ...over every PARTLY-mapped template, so an emptied sweep reads as wrong
    // rather than as a pass. A CORPUS CENSUS, not a behaviour claim: v0.32.0
    // authored 9 against the release bestiary, this branch's rift/dungeon mobs
    // brought a tenth, and the Drakelands/Willowfen/Evergarden harvest-gap fix
    // added bogtoad's ['gills', 'hide'] as an eleventh (dune_troll's
    // ['hide', 'fang'] and hedge_knight's ['cloth'] are fully mapped, so they
    // do not join this count). The per-template bound above is what holds
    // the line.
    expect(mixedSeen).toBe(11);
    // And the threshold really is where the comment says it is, stated as a
    // hypothetical shape rather than waiting for content to author one.
    expect(3 * expectedQty(1)).toBeGreaterThan(4 * expectedQty(0));
    expect(2 * expectedQty(1)).toBeLessThanOrEqual(3 * expectedQty(0));
  });

  it('gives every zone at least one corpse-harvestable camp mob (Drakelands/Willowfen/Evergarden harvest gap)', () => {
    // Drakelands, Willowfen, and Evergarden shipped with zero tagged mobs, so
    // nothing there was ever corpse-harvestable: e.g. Drakelands' dune_troll
    // (family troll) carried no tags while Mirefen's fen_troll (same family)
    // did. Derived from the real camp population, per zone, rather than a
    // hand-picked mob list, so a future zone that ships the same gap fails
    // here instead of going unnoticed.
    const campZoneIds = new Set<string>();
    const harvestableByZone = new Map<string, Set<string>>();
    for (const camp of CAMPS) {
      const template = MOBS[camp.mobId];
      const zone = zoneContaining(camp.center.x, camp.center.z);
      if (!zone) continue;
      campZoneIds.add(zone.id);
      if (!template || !isHarvestableCorpse(template.componentTags)) continue;
      if (!harvestableByZone.has(zone.id)) harvestableByZone.set(zone.id, new Set());
      harvestableByZone.get(zone.id)?.add(template.id);
    }
    // Every zone that actually spawns camps is checked, not just the three
    // named above: a bare list would silently stop covering a zone whose
    // camps moved. The floor is real (14 zones ship camp trash today), so an
    // empty or trivially small sweep cannot pass this by accident.
    expect(campZoneIds.size).toBeGreaterThanOrEqual(14);
    expect(ZONES.length).toBeGreaterThanOrEqual(campZoneIds.size);
    const gaps = [...campZoneIds].filter((id) => !(harvestableByZone.get(id)?.size ?? 0)).sort();
    expect(gaps).toEqual([]);
    // Decisive pin on the specific fix: the newly tagged mob now carries each
    // of the three previously-gapped zones. Drakelands also has the release
    // branch's harvestable dragonkin brood, so this must not assert exclusivity.
    expect([...(harvestableByZone.get('drakelands') ?? new Set())].sort()).toEqual(
      expect.arrayContaining(['dune_troll']),
    );
    expect(harvestableByZone.get('willowfen')).toEqual(new Set(['bogtoad']));
    expect(harvestableByZone.get('evergarden')).toEqual(new Set(['hedge_knight']));
  });

  it('lists which mobs are tagged so the sample stays visible in test output', () => {
    const summary = tagged.map((mob) => `${mob.id}: ${mob.componentTags?.join(', ')}`).sort();
    expect(summary.length).toBeGreaterThanOrEqual(10);
    // Not a hard assertion on content, just keeps a readable record in the
    // test report of exactly which mobs and tags were added.
    expect(summary).toEqual(expect.arrayContaining(summary));
  });
});
