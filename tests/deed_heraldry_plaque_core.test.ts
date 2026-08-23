import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createNameplateHeraldry,
  nameplateHeraldryInto,
} from '../src/render/nameplate_heraldry_core';
import {
  DEED_HERALDRY_PLAQUE_CLIP_PATHS,
  DEED_HERALDRY_PLAQUE_NOTCH_PX,
  DEED_HERALDRY_PLAQUE_TIP_PX,
} from '../src/ui/deed_heraldry_plaque_core';

const read = (rel: string): string => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

describe('Deed Heraldry plaque silhouette core', () => {
  it('pins fixed-pixel compact, mirrored, and ceremonial silhouettes', () => {
    expect(DEED_HERALDRY_PLAQUE_TIP_PX).toBe(8);
    expect(DEED_HERALDRY_PLAQUE_NOTCH_PX).toBe(4);
    expect(Object.keys(DEED_HERALDRY_PLAQUE_CLIP_PATHS).sort()).toEqual([
      'ceremonial',
      'compact',
      'mirror',
    ]);
    expect(DEED_HERALDRY_PLAQUE_CLIP_PATHS).toEqual({
      compact: 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 4px 50%)',
      mirror: 'polygon(8px 0, 100% 0, calc(100% - 4px) 50%, 100% 100%, 8px 100%, 0 50%)',
      ceremonial:
        'polygon(8px 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 8px 100%, 0 50%)',
    });
  });

  it('freezes the stored silhouette authority', () => {
    expect(Object.isFrozen(DEED_HERALDRY_PLAQUE_CLIP_PATHS)).toBe(true);
  });

  it('uses the same fixed-pixel pointed silhouette in the world hot path', () => {
    const out = nameplateHeraldryInto(createNameplateHeraldry(), {
      screenX: 320,
      nameRowBottomY: 200,
      nameRowWidth: 70,
      nameRowHeight: 16,
      slug: 'deepward',
    }) as unknown as {
      plaque: { x: number; y: number; w: number; h: number };
      plaqueShoulderX: number;
      plaqueNotchX: number;
    };
    expect(out.plaque).toEqual({ x: 278, y: 183, w: 92, h: 18 });
    expect(out.plaqueShoulderX).toBe(362);
    expect(out.plaqueNotchX).toBe(282);
    const source = read('src/render/nameplate_heraldry_core.ts');
    expect(source).toContain("from '../ui/deed_heraldry_plaque_core'");
    expect(source).not.toMatch(/ribbon/i);
  });
});

describe('Deed Heraldry plaque surface family', () => {
  it('uses the shared compact and mirrored plaque hosts on both game entries', () => {
    for (const rel of ['index.html', 'play.html']) {
      const html = read(rel);
      expect(html).toMatch(/class="uf-name-header deed-heraldry-plaque" id="pf-name-header"/);
      expect(html).toMatch(
        /class="uf-name-header deed-heraldry-plaque deed-heraldry-plaque-mirror" id="tf-name-header"/,
      );
    }
  });

  it('uses the ceremonial plaque for inspect and both compact directions in the picker preview', () => {
    const inspect = read('src/ui/inspect_window.ts');
    const deeds = read('src/ui/deeds_window.ts');
    expect(inspect).toContain(
      'class="inspect-heraldry-face deed-heraldry-plaque deed-heraldry-plaque-ceremonial"',
    );
    expect(deeds).toContain('class="deed-heraldry-preview-ribbon deed-heraldry-plaque"');
    expect(deeds).toContain(
      'class="deed-heraldry-preview-header deed-heraldry-plaque deed-heraldry-plaque-mirror"',
    );
  });

  it('binds CSS clip paths to the pure silhouette authority and stays static and sprite-free', () => {
    const components = read('src/styles/components.css');
    for (const [shape, clip] of Object.entries(DEED_HERALDRY_PLAQUE_CLIP_PATHS)) {
      expect(components.replace(/\s/g, ''), `${shape} plaque clip path`).toContain(
        clip.replace(/\s/g, ''),
      );
    }
    const cssFamily = [components, read('src/styles/hud.css'), read('src/styles/shell.css')]
      .flatMap((css) =>
        [
          ...css.matchAll(
            /[^{}]*(?:deed-heraldry-plaque|inspect-heraldry-banner|uf-name-header|deed-heraldry-preview-(?:ribbon|header))[^{}]*\{[^{}]*\}/g,
          ),
        ].map((match) => match[0]),
      )
      .join('\n');
    const family = `${read('src/ui/deed_heraldry_plaque_core.ts')}\n${cssFamily}`;
    expect(family).not.toMatch(/url\(|\.png|\.webp|\.jpg|filter:|backdrop-filter:/);
    expect(family).not.toMatch(/animation:|@keyframes|transition:/);
  });

  it('lets the interaction-scale unit plaque span its bar column and center the identity line', () => {
    const hud = read('src/styles/hud.css');
    const header = hud.match(
      /\n {2}\.uf-name-header\[data-border\]:not\(\[data-border=""\]\) \{([^}]*)\}/,
    )?.[1];
    const name = hud.match(
      /\n {2}\.uf-name-header\[data-border\]:not\(\[data-border=""\]\) \.uf-name \{([^}]*)\}/,
    )?.[1];
    const motif = hud.match(
      /\n {2}\.uf-name-header\[data-border\]:not\(\[data-border=""\]\) \.deed-heraldry-pattern \{([^}]*)\}/,
    )?.[1];
    expect(header).toContain('width: 100%;');
    expect(name).toContain('text-align: center;');
    expect(motif).toContain('top: 50%;');
    expect(motif).toContain('transform: translateY(-50%);');
  });

  it('keeps both Book previews centered and gives each seal a protected plaque gap', () => {
    const components = read('src/styles/components.css');
    const previewRows = components.match(
      /\n {2}\.deed-heraldry-preview-world,\n {2}\.deed-heraldry-preview-interaction \{([^}]*)\}/,
    )?.[1];
    const worldPlaque = components.match(/\n {2}\.deed-heraldry-preview-ribbon \{([^}]*)\}/)?.[1];
    const interactionPlaque = components.match(
      /\n {2}\.deed-heraldry-preview-header \{([^}]*)\}/,
    )?.[1];
    const interactionMotif = components.match(
      /\n {2}\.deed-heraldry-preview-header \.deed-heraldry-pattern \{([^}]*)\}/,
    )?.[1];
    expect(previewRows, 'shared preview centering rule missing').toBeTruthy();
    expect(previewRows).toContain('display: flex;');
    expect(previewRows).toContain('align-items: center;');
    expect(worldPlaque).toContain('margin-left: 2px;');
    expect(interactionPlaque).toContain('margin-left: 2px;');
    expect(interactionMotif).toContain('top: 50%;');
    expect(interactionMotif).toContain('transform: translateY(-50%);');
  });
});
