import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { PALADIN_CHOICE_ROWS } from '../src/sim/content/choice_rows_classic';
import { ABILITIES, abilitiesKnownAt } from '../src/sim/content/classes';
import { computeTalentModifiers, emptyAllocation } from '../src/sim/content/talents';
import { ABILITY_IMAGE_IDS, abilityImageUrl } from '../src/ui/icons';
import { PALADIN_TALENT_IMAGE_IDS } from '../src/ui/talent_icons';

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

// Dimensions straight out of the WebP header (lossy VP8, lossless VP8L, or extended VP8X),
// mirroring the dependency-free item-icon gate.
function webpSize(file: string): { width: number; height: number } {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(32);
    readSync(fd, buf, 0, 32, 0);
    const tag = buf.toString('ascii', 12, 16);
    if (tag === 'VP8 ')
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (tag === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (tag === 'VP8X') {
      return {
        width: (buf.readUIntLE(24, 3) & 0xffffff) + 1,
        height: (buf.readUIntLE(27, 3) & 0xffffff) + 1,
      };
    }
    throw new Error(`unknown webp chunk "${tag}" in ${file}`);
  } finally {
    closeSync(fd);
  }
}

const webpFiles = (): string[] =>
  walk(skillsDir).filter((p) => path.extname(p).toLowerCase() === '.webp');

const PR_2218_OWNED_CLASS_ICON_IDS = {
  hunter: [
    'bestial_wrath',
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
    'counter_shot',
    'volley',
    'wildheart',
  ],
  shaman: [
    'ancestor_return',
    'bloodlust',
    'chain_heal',
    'chain_lightning',
    'earthquake',
    'elemental_mastery',
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
    'holy_nova',
    'martyrs_aegis',
    'prayer_of_healing',
    'psychic_scream',
    'scouring_mercy',
    'seraphic_vigil',
    'summon_tithefiend',
    'shadowform',
    'veilstep',
  ],
} as const;

const OWNED_CLASS_SPECS = {
  hunter: ['beast_mastery', 'marksmanship', 'survival'],
  shaman: ['elemental', 'enhancement', 'restoration'],
  priest: ['discipline', 'holy', 'shadow'],
} as const;

const paladinWebpFiles = (): string[] =>
  webpFiles().filter((file) => path.basename(path.dirname(file)) === 'paladin');

type PaladinMapping = {
  license: string;
  generatedSource: string;
  iconSize: number;
  abilities: Array<{ abilityId: string; output: string }>;
  talents: Array<{
    talentId: string;
    name: string;
    sourceFile: string;
    output: string;
    confidence: string;
  }>;
};

const paladinMapping = (): PaladinMapping =>
  JSON.parse(
    readFileSync(path.join(skillsDir, 'paladin', 'mapping.json'), 'utf8'),
  ) as PaladinMapping;

describe('class ability webp icons', () => {
  it('has image-backed ability ids wired (guards the fixture)', () => {
    expect(ABILITY_IMAGE_IDS.size).toBeGreaterThan(0);
  });

  it('gives every paladin ability painted artwork', () => {
    const missing = Object.values(ABILITIES)
      .filter((ability) => ability.class === 'paladin')
      .map((ability) => ability.id)
      .filter((id) => !ABILITY_IMAGE_IDS.has(id))
      .sort();

    expect(missing).toEqual([]);
  });

  it('uses the owner-provided Fireball Form and Counterspell artwork', () => {
    expect(abilityImageUrl('fireball_form')).toBe('/ui/skills/mage/fireball_form.webp');
    expect(abilityImageUrl('counterspell')).toBe('/ui/skills/mage/counterspell.webp');

    const mapping = JSON.parse(
      readFileSync(path.join(skillsDir, 'mage', 'mapping.json'), 'utf8'),
    ) as {
      abilities: Array<{
        abilityId: string;
        sourceFile: string;
        output: string;
      }>;
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

  it('C) every committed webp is a wired ability or Paladin talent icon (no orphans)', () => {
    const orphans: string[] = [];
    for (const file of webpFiles()) {
      const id = path.basename(file, '.webp');
      if (PALADIN_TALENT_IMAGE_IDS.has(id)) {
        const expected = `/ui/skills/paladin/${id}.webp`;
        const actual = `/${path.relative(publicDir, file).split(path.sep).join('/')}`;
        if (actual !== expected) {
          orphans.push(
            `${path.relative(repoRoot, file)} (talent served as ${actual}, expected ${expected})`,
          );
        }
        continue;
      }
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

  it('D) keeps every PR #2218 ability icon at the canonical 128px square size', async () => {
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

  it('keeps every Paladin icon and provenance row in a one-to-one mapping', () => {
    const files = paladinWebpFiles().map((file) => path.basename(file));
    const mapping = paladinMapping();
    const entries = [
      ...mapping.abilities.map(({ abilityId: id, output }) => ({ id, output })),
      ...mapping.talents.map(({ talentId: id, output }) => ({ id, output })),
    ];
    const outputs = entries.map(({ output }) => output);

    expect(new Set(outputs).size, 'mapping.json contains duplicate output filenames').toBe(
      outputs.length,
    );
    expect(
      files.filter((file) => !outputs.includes(file)),
      'Paladin artwork without provenance in mapping.json',
    ).toEqual([]);
    expect(
      outputs.filter((file) => !files.includes(file)),
      'mapping.json lists missing Paladin artwork',
    ).toEqual([]);
    expect(
      entries.filter(({ id, output }) => output !== `${id}.webp`),
      'Paladin provenance rows must map each ability or talent id to its canonical filename',
    ).toEqual([]);
  });

  it('keeps choice rows, painted talent ids, files, and provenance in exact parity', () => {
    const mapping = paladinMapping();
    const choices = PALADIN_CHOICE_ROWS.rows.flatMap((row) => row.options);
    const choiceIds = choices.map(({ id }) => id).sort();
    const paintedIds = [...PALADIN_TALENT_IMAGE_IDS].sort();
    const mappedIds = mapping.talents.map(({ talentId }) => talentId).sort();
    const fileIds = paladinWebpFiles()
      .map((file) => path.basename(file, '.webp'))
      .filter((id) => id.startsWith('pal_r'))
      .sort();

    expect(paintedIds).toEqual(choiceIds);
    expect(mappedIds).toEqual(choiceIds);
    expect(fileIds).toEqual(choiceIds);
    expect(mapping.generatedSource).toBe('OpenAI image generation, original project artwork');
    expect(mapping.license).toContain('project-owned original art');

    const choiceNames = new Map(choices.map(({ id, name }) => [id, name]));
    for (const entry of mapping.talents) {
      expect(entry.name, entry.talentId).toBe(choiceNames.get(entry.talentId));
      expect(entry.sourceFile, entry.talentId).toBe(mapping.generatedSource);
      expect(entry.confidence, entry.talentId).toBe('high');
    }
  });

  it('keeps every Paladin icon at the declared 128px square', () => {
    const { iconSize } = paladinMapping();
    expect(iconSize).toBe(128);
    const wrong = paladinWebpFiles()
      .map((file) => ({ file, ...webpSize(file) }))
      .filter(({ width, height }) => width !== iconSize || height !== iconSize)
      .map(({ file, width, height }) => `${path.basename(file)} (${width}x${height})`);

    expect(
      wrong,
      'resize Paladin source art to 128px square before running `npm run assets:skills`',
    ).toEqual([]);
  });
});
