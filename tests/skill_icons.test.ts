import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { abilitiesKnownAt } from '../src/sim/content/classes';
import { computeTalentModifiers, emptyAllocation } from '../src/sim/content/talents';
import { ABILITY_IMAGE_IDS, abilityImageUrl } from '../src/ui/icons';

// Gate for the committed WebP class ability icons. The art under
// public/ui/skills/<class>/<id>.webp is the source of truth (WebP only, no PNG/JPG in the
// tree), and abilityImageUrl serves it for the action bar (kind 'ability'), aura/debuff
// frames (kind 'aura'), and the /wiki guide class pages. The guard is a bijection:
//   A) every id wired into ABILITY_IMAGE_IDS resolves to a committed, VALID .webp (a wired
//      id without art, a deleted/renamed file, or a zero-byte/renamed-PNG file fails here
//      instead of rendering a blank or broken icon);
//   B) only .webp art (+ mapping.json) is committed under public/ui/skills, i.e. a
//      contributor dropped in a .png/.jpg/etc. and forgot to run `npm run assets:skills`
//      (scripts/convert_skill_icons_webp.mjs), which converts to webp and deletes the source.
//      This is an allowlist (anything that is not .webp/mapping.json fails), so it asserts the
//      actual "webp only" invariant and cannot silently drift from the convert script;
//   C) every committed .webp is a WIRED ability icon living in its own derived class folder
//      (no orphan/dead-weight art, no file in the wrong class folder).
// Filesystem-only (no canvas), so it runs headless on CI in the default node env.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(repoRoot, 'public');
const skillsDir = path.join(publicDir, 'ui/skills');

// Only WebP art and the per-class provenance file may live under public/ui/skills. Dotfiles
// (e.g. a local .DS_Store) are ignored so the gate does not false-positive on dev cruft.
const isDotfile = (p: string): boolean => path.basename(p).startsWith('.');
const isMapping = (p: string): boolean => path.basename(p) === 'mapping.json';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile()) out.push(p);
  }
  return out;
}

// A real WebP starts with a RIFF container whose form-type is "WEBP" (bytes 8..12). This
// rejects a zero-byte/truncated write and a foreign raster (e.g. a PNG) renamed to .webp.
function isValidWebp(file: string): boolean {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(12);
    const n = readSync(fd, buf, 0, 12, 0);
    return (
      n === 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP'
    );
  } finally {
    closeSync(fd);
  }
}

const webpFiles = (): string[] =>
  walk(skillsDir).filter((p) => path.extname(p).toLowerCase() === '.webp');

// The 12 rework ids whose art was superseded by the accepted release art in the
// v0.34.0 missing-painted-icons wave (bestial_wrath, counter_shot, volley,
// holy_nova, prayer_of_healing, psychic_scream, shadowform, bloodlust,
// chain_heal, chain_lightning, earthquake, elemental_mastery) are pinned by the
// generated-additions test below instead of this PR-provenance fixture.
const PR_2218_OWNED_CLASS_ICON_IDS = {
  hunter: [
    'bloodhook',
    'bloodtrail_assault',
    'cold_focus',
    'fieldcraft_reentry',
    'frostjaw_trap',
    'hunting_momentum',
    'measured_shot',
    'pack_command',
    'pack_rally',
    'shellskin',
    'shrapnel_charge',
    'stampede',
    'trailbreak',
    'unleash_beast',
    'wildheart',
  ],
  shaman: [
    'ancestor_return',
    'galeheart_weapon',
    'lifespring_weapon',
    'primal_exaltation',
    'stoneward',
    'stormsurge',
    'thunder_reservoir',
    'tidecall',
    'unleash_weapon',
    'warspirit_cadence',
  ],
  priest: [
    'choir_of_deliverance',
    'martyrs_aegis',
    'scouring_mercy',
    'seraphic_vigil',
    'summon_tithefiend',
    'veilstep',
  ],
} as const;

const OWNED_CLASS_SPECS = {
  hunter: ['beast_mastery', 'marksmanship', 'survival'],
  shaman: ['elemental', 'enhancement', 'restoration'],
  priest: ['discipline', 'holy', 'shadow'],
} as const;

interface MissingWaveAbilityPin {
  kind: string;
  id: string;
  class: string;
  runtimeUrl: string;
  acceptedSha256: string;
  acceptedBytes: number;
}

function missingWaveAbilityPins(): MissingWaveAbilityPin[] {
  const manifest = JSON.parse(
    readFileSync(
      path.join(repoRoot, 'docs/achievements/missing-painted-icons-accepted-art.json'),
      'utf8',
    ),
  ) as { assets: MissingWaveAbilityPin[] };
  return manifest.assets.filter((asset) => asset.kind === 'ability');
}

describe('class ability webp icons', () => {
  it('has image-backed ability ids wired (guards the fixture)', () => {
    expect(ABILITY_IMAGE_IDS.size).toBeGreaterThan(0);
  });

  it('uses the owner-provided Fireball Form and Counterspell artwork', () => {
    expect(abilityImageUrl('fireball_form')).toBe('/ui/skills/mage/fireball_form.webp');
    expect(abilityImageUrl('counterspell')).toBe('/ui/skills/mage/counterspell.webp');

    const mapping = JSON.parse(
      readFileSync(path.join(skillsDir, 'mage', 'mapping.json'), 'utf8'),
    ) as {
      abilities: Array<{ abilityId: string; sourceFile: string; output: string }>;
    };
    const requested = new Map(
      mapping.abilities
        .filter(({ abilityId }) => ['fireball_form', 'counterspell'].includes(abilityId))
        .map(({ abilityId, sourceFile, output }) => [abilityId, { sourceFile, output }]),
    );
    expect(Object.fromEntries(requested)).toEqual({
      fireball_form: {
        sourceFile: 'owner-provided artwork (Fireball Form)',
        output: 'fireball_form.webp',
      },
      counterspell: {
        sourceFile: 'owner-provided artwork (Counterspell)',
        output: 'counterspell.webp',
      },
    });
  });

  it('uses the owner-provided painted icons for both Chronomancy abilities', () => {
    expect(abilityImageUrl('collective_reversal')).toBe('/ui/skills/mage/collective_reversal.webp');
    expect(abilityImageUrl('temporal_hourglass')).toBe('/ui/skills/mage/temporal_hourglass.webp');
  });

  it('image-backs every owned-class icon delivered by PR #2218 with recorded provenance', () => {
    for (const [cls, ids] of Object.entries(PR_2218_OWNED_CLASS_ICON_IDS)) {
      const mapping = JSON.parse(
        readFileSync(path.join(skillsDir, cls, 'mapping.json'), 'utf8'),
      ) as {
        abilities: Array<{ abilityId: string; sourcePack?: string; output: string }>;
      };
      const entries = new Map(mapping.abilities.map((entry) => [entry.abilityId, entry]));

      for (const id of ids) {
        expect(abilityImageUrl(id)).toBe(`/ui/skills/${cls}/${id}.webp`);
        expect(entries.get(id)).toMatchObject({
          abilityId: id,
          sourcePack: 'OpenAI image generation through Codex',
          output: `${id}.webp`,
        });
      }
    }
  });

  it('image-backs every level-20 Hunter, Shaman, and Priest spellbook entry', () => {
    const missing: string[] = [];
    for (const cls of Object.keys(OWNED_CLASS_SPECS) as Array<keyof typeof OWNED_CLASS_SPECS>) {
      const specs = OWNED_CLASS_SPECS[cls];
      for (const spec of specs) {
        const mods = computeTalentModifiers(cls, { ...emptyAllocation(), spec }, 20);
        for (const { def } of abilitiesKnownAt(cls, 20, mods)) {
          if (!abilityImageUrl(def.id)) missing.push(`${cls}/${spec}/${def.id}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('A) every image-backed ability id resolves to a committed, valid .webp', () => {
    const broken: string[] = [];
    for (const id of ABILITY_IMAGE_IDS) {
      const url = abilityImageUrl(id);
      if (!url) {
        broken.push(`${id} (abilityImageUrl returned null; missing ability class?)`);
        continue;
      }
      expect(url, `${id} must resolve to a webp url`).toMatch(/^\/ui\/skills\/.+\.webp$/);
      const file = path.join(publicDir, url.replace(/^\//, ''));
      if (!existsSync(file)) {
        broken.push(`${id} -> ${url} (missing file)`);
        continue;
      }
      if (!isValidWebp(file))
        broken.push(`${id} -> ${url} (not a valid webp: bad RIFF/WEBP header)`);
    }
    expect(broken).toEqual([]);
  });

  it('B) commits only webp art (no unconverted png/jpg/etc., no stray files)', () => {
    const stray = walk(skillsDir)
      .filter((p) => !isDotfile(p) && !isMapping(p) && path.extname(p).toLowerCase() !== '.webp')
      .map((p) => path.relative(repoRoot, p));
    expect(
      stray,
      'only .webp art (+ mapping.json) may live under public/ui/skills; run `npm run assets:skills` to convert dropped-in art',
    ).toEqual([]);
  });

  it('C) every committed webp is a wired ability icon in its own class folder (no orphans)', () => {
    const orphans: string[] = [];
    for (const file of webpFiles()) {
      const id = path.basename(file, '.webp');
      if (!ABILITY_IMAGE_IDS.has(id)) {
        orphans.push(`${path.relative(repoRoot, file)} (id "${id}" not in ABILITY_IMAGE_IDS)`);
        continue;
      }
      const url = abilityImageUrl(id);
      const expected = `/${path.relative(publicDir, file).split(path.sep).join('/')}`;
      if (url !== expected) {
        orphans.push(`${path.relative(repoRoot, file)} (served as ${url}, expected ${expected})`);
      }
    }
    expect(
      orphans,
      'unwired or misplaced webp(s) committed; remove dead-weight art or wire the id into ABILITY_IMAGE_IDS',
    ).toEqual([]);
  });

  it('keeps every PR #2218 ability icon at the canonical 128px square size', async () => {
    const wrongSize: string[] = [];
    for (const [cls, ids] of Object.entries(PR_2218_OWNED_CLASS_ICON_IDS)) {
      for (const id of ids) {
        const file = path.join(skillsDir, cls, `${id}.webp`);
        const metadata = await sharp(file).metadata();
        if (metadata.width !== 128 || metadata.height !== 128) {
          wrongSize.push(`${path.relative(repoRoot, file)} (${metadata.width}x${metadata.height})`);
        }
      }
    }
    expect(wrongSize).toEqual([]);
  });

  it('D) the 90 generated additions decode as unique, opaque, exact 128px reviewed art', async () => {
    const pins = missingWaveAbilityPins();
    expect(pins).toHaveLength(90);
    const hashes = new Set<string>();
    const mapped = new Set<string>();
    for (const className of [
      'druid',
      'hunter',
      'mage',
      'paladin',
      'priest',
      'rogue',
      'shaman',
      'warlock',
      'warrior',
    ]) {
      const mapping = JSON.parse(
        readFileSync(path.join(skillsDir, className, 'mapping.json'), 'utf8'),
      ) as {
        abilities: Array<{
          abilityId: string;
          sourcePack: string;
          source?: string;
          owner?: string;
          license?: string;
        }>;
      };
      for (const entry of mapping.abilities.filter(
        ({ sourcePack }) => sourcePack === 'woc_openai_missing_painted_icons_2026_08_01',
      )) {
        expect(entry.source, entry.abilityId).toBe('OpenAI built-in image generation');
        expect(entry.owner, entry.abilityId).toBe('World of ClaudeCraft');
        expect(entry.license, entry.abilityId).toContain('project asset');
        expect(entry.license, entry.abilityId).not.toContain('CraftPix');
        mapped.add(entry.abilityId);
      }
    }
    expect([...mapped].sort()).toEqual(pins.map(({ id }) => id).sort());

    for (const pin of pins) {
      expect(ABILITY_IMAGE_IDS.has(pin.id), `${pin.id} registry wiring`).toBe(true);
      expect(abilityImageUrl(pin.id), `${pin.id} runtime URL`).toBe(pin.runtimeUrl);
      const file = path.join(publicDir, pin.runtimeUrl.replace(/^\//, ''));
      const bytes = readFileSync(file);
      expect(bytes.length, `${pin.id} accepted bytes`).toBe(pin.acceptedBytes);
      expect(bytes.length, `${pin.id} weight ceiling`).toBeLessThanOrEqual(15 * 1024);
      expect(createHash('sha256').update(bytes).digest('hex'), `${pin.id} accepted hash`).toBe(
        pin.acceptedSha256,
      );
      expect(hashes.has(pin.acceptedSha256), `${pin.id} duplicate painted encoding`).toBe(false);
      hashes.add(pin.acceptedSha256);
      const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(decoded.info.width, `${pin.id} width`).toBe(128);
      expect(decoded.info.height, `${pin.id} height`).toBe(128);
      let opaque = true;
      for (let offset = 3; offset < decoded.data.length; offset += decoded.info.channels) {
        if (decoded.data[offset] !== 255) {
          opaque = false;
          break;
        }
      }
      expect(opaque, `${pin.id} must keep its full-square opaque background`).toBe(true);
    }
    expect(hashes.size).toBe(90);
  });
});
