// Lantern Hall's four elemental weapon appearances, sold by the guild quartermaster for Lantern
// Seals beside the guild's blade (content/guild_contracts.ts, content/weapon_skins.ts): the
// catalog records and their stock rows, the purchase rules for a staff look as well as a sword
// look (grant before spend, owned refusal, the server's per-session ledger), and the render and
// art each one needs to be worn: a grip family, a VFX row with its element, a swing trail, the
// GLB in the skin texture shape, the Armory card and the bag preview.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buyGuildCosmeticWire } from '../server/quest_command_wire';
import { KAYKIT_WEAPON_ACCESSORY } from '../src/render/characters/assets';
import { weaponSkinSwingTrail } from '../src/render/weapon_skin_trail_core';
import { WEAPON_VFX } from '../src/render/weapon_vfx';
import {
  GUILD_QUARTERMASTER_STOCK,
  GUILD_QUARTERMASTER_STOCK_BY_ID,
  LANTERN_HALL_ELEMENTAL_SEALS,
  LANTERN_HALL_ELEMENTAL_SKIN_IDS,
  LANTERN_SEAL_ITEM_ID,
} from '../src/sim/content/guild_contracts';
import {
  GUILD_QUARTERMASTER_NPC_ID,
  HIGHWATCH_GUILD_ENTITY_IDS,
} from '../src/sim/content/highwatch_guild';
import { STORE_WEAPON_SKIN_LIST, WEAPON_SKINS } from '../src/sim/content/weapon_skins';
import type { GuildAccountPort } from '../src/sim/guild_quartermaster';
import { Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';
import { armorySkinStrings } from '../src/ui/i18n.catalog/armory';

const ROOT = join(__dirname, '..');

/** Skin id, its held model, its weapon type and its element's VFX window hue. */
const ARMS = [
  { skin: 'hearthbrand_sword', model: 'hearthbrand', type: 'sword', name: 'Hearthbrand' },
  { skin: 'squallcrest_sword', model: 'squallcrest', type: 'sword', name: 'Squallcrest' },
  { skin: 'rimelight_staff', model: 'rimelight_staff', type: 'staff', name: 'Rimelight Staff' },
  { skin: 'duskwick_staff', model: 'duskwick_staff', type: 'staff', name: 'Duskwick Staff' },
] as const;

function atGarrick(seals: number) {
  const s = new Sim({ seed: 7, playerClass: 'mage' });
  s.resetDay = '2026-10-13';
  const pid = s.player.id;
  const npc = s.entities.get(HIGHWATCH_GUILD_ENTITY_IDS[GUILD_QUARTERMASTER_NPC_ID]);
  if (!npc) throw new Error('no quartermaster');
  s.player.pos = { x: npc.pos.x + 2, y: npc.pos.y, z: npc.pos.z };
  if (seals > 0) s.ctx.addItem(LANTERN_SEAL_ITEM_ID, seals, pid);
  const guildEvents = (): SimEvent[] =>
    s.tick().filter((e: SimEvent) => e.type.startsWith('guildCosmetic'));
  const sealsLeft = () => s.ctx.countItem(LANTERN_SEAL_ITEM_ID, pid);
  return { s, pid, guildEvents, sealsLeft };
}

describe('the catalog records', () => {
  it('lists the four arms in shop order, at the provisional 20 seals each', () => {
    expect([...LANTERN_HALL_ELEMENTAL_SKIN_IDS]).toEqual(ARMS.map((a) => a.skin));
    expect(LANTERN_HALL_ELEMENTAL_SEALS).toBe(20);
    // after the guild's blade, before the horse; the offer ids ride the wire, so literals
    expect(GUILD_QUARTERMASTER_STOCK.map((o) => o.id).slice(4, 8)).toEqual([
      'weapon_skin_hearthbrand_sword',
      'weapon_skin_squallcrest_sword',
      'weapon_skin_rimelight_staff',
      'weapon_skin_duskwick_staff',
    ]);
    for (const arm of ARMS) {
      expect(GUILD_QUARTERMASTER_STOCK_BY_ID[`weapon_skin_${arm.skin}`]).toEqual({
        id: `weapon_skin_${arm.skin}`,
        kind: 'weaponSkin',
        skinId: arm.skin,
        seals: 20,
      });
    }
  });

  it('each is an earned epic skin of its weapon type the Claudium store never lists', () => {
    for (const arm of ARMS) {
      expect(WEAPON_SKINS[arm.skin]).toEqual({
        id: arm.skin,
        collection: 'lantern_hall',
        rarity: 'epic',
        weaponType: arm.type,
        model: arm.model,
        season: 1,
        earnedFrom: 'lantern_hall',
      });
      expect(
        STORE_WEAPON_SKIN_LIST.some((s) => s.id === arm.skin),
        arm.skin,
      ).toBe(false);
      expect(armorySkinStrings[arm.skin].name).toBe(arm.name);
      // the look is a look: every lore line says so
      expect(armorySkinStrings[arm.skin].lore, arm.skin).toMatch(/only a look\.$/);
    }
  });
});

describe('buying an elemental arm', () => {
  it('grants a staff look to the offline account mirror, takes 20, then refuses it as owned', () => {
    const { s, guildEvents, sealsLeft } = atGarrick(30);
    const offer = 'weapon_skin_duskwick_staff';
    s.buyGuildCosmetic(offer);
    expect(guildEvents()).toEqual([
      expect.objectContaining({ type: 'guildCosmeticBought', offerId: offer }),
    ]);
    expect(s.accountCosmetics.weaponSkinIds).toContain('duskwick_staff');
    expect(sealsLeft()).toBe(10);
    s.buyGuildCosmetic(offer);
    expect(guildEvents()).toEqual([
      expect.objectContaining({ type: 'guildCosmeticRefused', offerId: offer, reason: 'owned' }),
    ]);
    expect(sealsLeft()).toBe(10);
  });

  it('refuses short of seals and keeps every one', () => {
    const { s, guildEvents, sealsLeft } = atGarrick(19);
    s.buyGuildCosmetic('weapon_skin_hearthbrand_sword');
    expect(guildEvents()).toEqual([
      expect.objectContaining({ type: 'guildCosmeticRefused', reason: 'seals' }),
    ]);
    expect(sealsLeft()).toBe(19);
    expect(s.accountCosmetics.weaponSkinIds).not.toContain('hearthbrand_sword');
  });

  it("owns one arm without owning the others, through the server session's port", () => {
    const { s, pid, guildEvents, sealsLeft } = atGarrick(40);
    const granted: string[] = ['squallcrest_sword'];
    const port: GuildAccountPort = {
      ownsWeaponSkin: (id) => granted.includes(id),
      grantWeaponSkin: (id) => {
        granted.push(id);
        return true;
      },
    };
    const send = (offer: string) =>
      buyGuildCosmeticWire(s, { cmd: 'guild_buy_cosmetic', offer } as never, pid, port);
    send('weapon_skin_squallcrest_sword');
    expect(guildEvents()).toEqual([expect.objectContaining({ reason: 'owned' })]);
    send('weapon_skin_rimelight_staff');
    expect(guildEvents()).toEqual([
      expect.objectContaining({
        type: 'guildCosmeticBought',
        offerId: 'weapon_skin_rimelight_staff',
      }),
    ]);
    expect(granted).toEqual(['squallcrest_sword', 'rimelight_staff']);
    expect(sealsLeft()).toBe(20);
  });
});

describe('what it takes to wear one', () => {
  it('holds each in its own grip family and carries an epic VFX row and a swing trail', () => {
    for (const arm of ARMS) {
      expect(KAYKIT_WEAPON_ACCESSORY[arm.model], arm.model).toBe(
        arm.type === 'staff' ? 'VAR_STAFF' : 'VAR_SWORD',
      );
      const spec = WEAPON_VFX[arm.model];
      expect(spec?.tier, arm.model).toBe('epic');
      expect(spec.name).toBe(arm.name);
      expect(spec.type).toBe(arm.type);
      expect(weaponSkinSwingTrail(arm.skin, 'melee'), arm.skin).not.toBeNull();
    }
  });

  it('gives each element its signature effect', () => {
    const kinds = (model: string) => WEAPON_VFX[model].fx.map((c) => c.kind);
    // the storm blade crackles; nothing else in the catalog needs arcs
    expect(kinds('squallcrest')).toContain('arcs');
    expect(kinds('squallcrest')).toContain('aurora');
    // the dusk-flame's smoke is drawn over the scene so it can darken it
    const smoke = WEAPON_VFX.duskwick_staff.fx.find(
      (c) => c.kind === 'drift' && c.blend === 'smoke',
    );
    expect(smoke).toBeDefined();
    // each glow window is the element's own hue: fire warm, sea and frost blue, dusk violet
    expect(WEAPON_VFX.hearthbrand.emissive?.hue).toEqual([8, 52]);
    expect(WEAPON_VFX.squallcrest.emissive?.hue).toEqual([180, 215]);
    expect(WEAPON_VFX.rimelight_staff.emissive?.hue).toEqual([175, 215]);
    expect(WEAPON_VFX.duskwick_staff.emissive?.hue).toEqual([260, 300]);
  });

  it('ships the GLB at its grip family height, the Armory card and the bag preview', () => {
    for (const arm of ARMS) {
      const glb = join(ROOT, 'public', 'models', 'weapons', `${arm.model}.glb`);
      expect(existsSync(glb), glb).toBe(true);
      const buf = readFileSync(glb);
      const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
      let lo = Infinity;
      let hi = -Infinity;
      for (const mesh of json.meshes)
        for (const prim of mesh.primitives) {
          const acc = json.accessors[prim.attributes.POSITION];
          lo = Math.min(lo, acc.min[1]);
          hi = Math.max(hi, acc.max[1]);
        }
      // grip at the origin; a sword under VAR_SWORD's 2.0 clamp (give or take its pommel ring),
      // a staff under VAR_STAFF's 2.4
      expect(lo, arm.model).toBeLessThan(0);
      expect(hi - lo, arm.model).toBeLessThanOrEqual(arm.type === 'staff' ? 2.4 : 2.05);
      expect(hi - lo, arm.model).toBeGreaterThan(arm.type === 'staff' ? 2.2 : 1.9);
      expect(existsSync(join(ROOT, 'public', 'ui', 'store', 'armory', `${arm.skin}.webp`))).toBe(
        true,
      );
      expect(existsSync(join(ROOT, 'public', 'ui', 'weapons', `${arm.model}.jpg`))).toBe(true);
    }
  });
});
