import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createNameplateCartouche,
  NAMEPLATE_CARTOUCHE_BRACKET_ARM,
  NAMEPLATE_CARTOUCHE_BRACKET_INSET,
  NAMEPLATE_CARTOUCHE_CLASP_HEIGHT,
  NAMEPLATE_CARTOUCHE_CLASP_OVERLAP,
  NAMEPLATE_CARTOUCHE_CLASP_WIDTH,
  NAMEPLATE_CARTOUCHE_EXTRA_LIFT,
  NAMEPLATE_CARTOUCHE_INNER_INSET,
  NAMEPLATE_CARTOUCHE_NAME_BASELINE_FROM_CENTER,
  NAMEPLATE_CARTOUCHE_PAD_X,
  NAMEPLATE_CARTOUCHE_PAD_Y,
  NAMEPLATE_CARTOUCHE_RADIUS,
  NAMEPLATE_CARTOUCHE_TITLE_BASELINE,
  NAMEPLATE_CARTOUCHE_TITLE_STEP,
  NAMEPLATE_CARTOUCHE_WELL_ALPHA,
  NAMEPLATE_CARTOUCHE_WELL_FILL,
  type NameplateCartoucheInput,
  nameplateCartoucheInto,
} from '../src/render/nameplate_cartouche_core';
import { OVERLAP_THRESHOLD_Y_PX, STACK_OFFSET_PX } from '../src/render/nameplate_declutter';
import { BORDER_ACCENT_SLUGS, borderAccent } from '../src/ui/deed_border_view';
import { assertAllocationStable } from './util/alloc_probe';

const read = (rel: string): string =>
  readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

function input(over: Partial<NameplateCartoucheInput> = {}): NameplateCartoucheInput {
  return {
    screenX: 320,
    nameRowBottomY: 200,
    nameRowWidth: 70,
    nameRowHeight: 16,
    titleWidth: 0,
    slug: 'deepward',
    ...over,
  };
}

function layout(over: Partial<NameplateCartoucheInput> = {}) {
  return nameplateCartoucheInto(createNameplateCartouche(), input(over));
}

describe('nameplate cartouche named constants', () => {
  it('pins pad, radius, well alpha, extraLift, and well fill to literals', () => {
    expect(NAMEPLATE_CARTOUCHE_PAD_X).toBe(9);
    expect(NAMEPLATE_CARTOUCHE_PAD_Y).toBe(5);
    expect(NAMEPLATE_CARTOUCHE_RADIUS).toBe(6);
    expect(NAMEPLATE_CARTOUCHE_WELL_ALPHA).toBe(0.4);
    expect(NAMEPLATE_CARTOUCHE_EXTRA_LIFT).toBe(14);
    expect(NAMEPLATE_CARTOUCHE_WELL_FILL).toBe('#14110c');
    expect(NAMEPLATE_CARTOUCHE_TITLE_STEP).toBe(11);
    expect(NAMEPLATE_CARTOUCHE_TITLE_BASELINE).toBe(9);
    expect(NAMEPLATE_CARTOUCHE_NAME_BASELINE_FROM_CENTER).toBe(5);
    expect(NAMEPLATE_CARTOUCHE_BRACKET_ARM).toBe(6);
    expect(NAMEPLATE_CARTOUCHE_BRACKET_INSET).toBe(1);
    expect(NAMEPLATE_CARTOUCHE_CLASP_WIDTH).toBe(10);
    expect(NAMEPLATE_CARTOUCHE_CLASP_HEIGHT).toBe(5);
    expect(NAMEPLATE_CARTOUCHE_CLASP_OVERLAP).toBe(1);
    expect(NAMEPLATE_CARTOUCHE_INNER_INSET).toBe(2.5);
    expect(NAMEPLATE_CARTOUCHE_EXTRA_LIFT).toBe(
      NAMEPLATE_CARTOUCHE_PAD_Y * 2 +
        (NAMEPLATE_CARTOUCHE_CLASP_HEIGHT - NAMEPLATE_CARTOUCHE_CLASP_OVERLAP),
    );
  });

  it('keeps the shared well fill off every Book of Deeds palette hex', () => {
    for (const slug of BORDER_ACCENT_SLUGS) {
      const accent = borderAccent(slug);
      expect(accent).not.toBeNull();
      expect(NAMEPLATE_CARTOUCHE_WELL_FILL).not.toBe(accent?.frame);
      expect(NAMEPLATE_CARTOUCHE_WELL_FILL).not.toBe(accent?.edge);
      expect(NAMEPLATE_CARTOUCHE_WELL_FILL).not.toBe(accent?.glow);
    }
  });
});

describe('nameplateCartoucheInto allocation and purity', () => {
  it('writes into the caller-owned record and returns that same instance', () => {
    const out = createNameplateCartouche();
    const returned = nameplateCartoucheInto(out, input());
    expect(returned).toBe(out);
  });

  it('allocates no per-call container or nested slot', () => {
    const out = createNameplateCartouche();
    const first = input({ nameRowWidth: 40, slug: 'deepward' });
    const second = input({ nameRowWidth: 120, titleWidth: 90, slug: 'reliquary_gilt' });
    let flip = false;
    assertAllocationStable(() => {
      flip = !flip;
      return nameplateCartoucheInto(out, flip ? first : second);
    }, 64);
    const again = createNameplateCartouche();
    nameplateCartoucheInto(again, input());
    expect(out.brackets[0]).not.toBe(again.brackets[0]);
    expect(out.well).not.toBe(again.well);
  });

  it('reuses every nested rect, bracket, and clasp across calls', () => {
    const out = createNameplateCartouche();
    const outer = out.outer;
    const well = out.well;
    const inner = out.inner;
    const clasp = out.clasp;
    const brackets = out.brackets;
    const tl = out.brackets[0];
    const tr = out.brackets[1];
    const br = out.brackets[2];
    const bl = out.brackets[3];
    nameplateCartoucheInto(out, input({ slug: '' }));
    nameplateCartoucheInto(out, input({ titleWidth: 140, nameRowHeight: 24 }));
    expect(out.outer).toBe(outer);
    expect(out.well).toBe(well);
    expect(out.inner).toBe(inner);
    expect(out.clasp).toBe(clasp);
    expect(out.brackets).toBe(brackets);
    expect(out.brackets[0]).toBe(tl);
    expect(out.brackets[1]).toBe(tr);
    expect(out.brackets[2]).toBe(br);
    expect(out.brackets[3]).toBe(bl);
  });
});

describe('E1 name only: tight plaque, symmetric pad, name optically centered', () => {
  it('hugs the name row with 9px x and 5px y pad and centers the name group', () => {
    const out = layout({
      screenX: 320,
      nameRowBottomY: 200,
      nameRowWidth: 70,
      nameRowHeight: 16,
      titleWidth: 0,
      slug: 'curators_gilt',
    });
    expect(out.active).toBe(true);
    expect(out.extraLift).toBe(14);
    expect(out.outer.w).toBe(88);
    expect(out.outer.h).toBe(26);
    expect(out.outer.x).toBe(276);
    expect(out.outer.y).toBe(179);
    expect(out.well.x).toBe(276);
    expect(out.well.y).toBe(179);
    expect(out.well.w).toBe(88);
    expect(out.well.h).toBe(26);
    expect(out.radius).toBe(6);
    expect(out.nameRowLeft).toBe(285);
    expect(out.nameRowTop).toBe(184);
    expect(out.nameBaseline).toBe(197);
    expect(out.titleCenterX).toBe(320);
  });
});

describe('E2 name + title: title inside the well, centered on screenX, 2px gap', () => {
  it('keeps the title baseline 9px below the name row (2px gap above a 10px title)', () => {
    const out = layout({
      screenX: 320,
      nameRowBottomY: 200,
      nameRowWidth: 70,
      nameRowHeight: 16,
      titleWidth: 50,
      slug: 'deepward',
    });
    expect(out.active).toBe(true);
    expect(out.outer.w).toBe(88);
    expect(out.outer.h).toBe(37);
    expect(out.outer.y).toBe(179);
    expect(out.outer.y + out.outer.h).toBe(216);
    expect(out.titleBaseline).toBe(209);
    expect(out.titleCenterX).toBe(320);
    expect(out.titleBaseline - 200).toBe(9);
    expect(out.nameRowTop).toBe(184);
    expect(out.nameRowTop).toBeGreaterThan(out.well.y);
    expect(out.titleBaseline).toBeLessThan(out.well.y + out.well.h);
  });
});

describe('E3 title wider than name: plaque grows, name row stays a centered group', () => {
  it('widens to the title and keeps the name group on screenX', () => {
    const out = layout({
      screenX: 320,
      nameRowBottomY: 200,
      nameRowWidth: 40,
      nameRowHeight: 16,
      titleWidth: 100,
      slug: 'prestige_laurels',
    });
    expect(out.outer.w).toBe(118);
    expect(out.outer.x).toBe(261);
    expect(out.nameRowLeft).toBe(300);
    expect(out.nameRowLeft + 40).toBe(340);
    expect((out.nameRowLeft + out.nameRowLeft + 40) / 2).toBe(320);
    expect(out.titleCenterX).toBe(320);
    expect(out.well.w).toBe(118);
  });
});

describe('E4 Discord portrait 24px: row follows the portrait, text centered, no floor kiss', () => {
  it('centers the name baseline in the 24px row and keeps pad under the portrait', () => {
    const out = layout({
      screenX: 320,
      nameRowBottomY: 200,
      nameRowWidth: 90,
      nameRowHeight: 24,
      titleWidth: 0,
      slug: 'reliquary_gilt',
    });
    expect(out.outer.h).toBe(34);
    expect(out.nameRowTop).toBe(176);
    expect(out.nameBaseline).toBe(193);
    expect(out.nameBaseline).not.toBe(197);
    expect(out.nameRowTop - out.well.y).toBe(5);
    expect(out.well.y + out.well.h - (out.nameRowTop + 24)).toBe(5);
    expect(out.nameRowTop + 24).toBeLessThan(out.well.y + out.well.h);
  });
});

describe('E5 holder/dev badge 15px, no portrait: same centering against the stack', () => {
  it('centers the name on a 16px min row that already clears a 15px badge', () => {
    const out = layout({
      nameRowHeight: 16,
      nameRowWidth: 55,
      titleWidth: 0,
      slug: 'deepward',
    });
    expect(out.nameBaseline).toBe(197);
    expect(out.nameRowTop).toBe(184);
    expect(out.nameBaseline - out.nameRowTop).toBe(13);
  });
});

describe('E6 all badges: group centered, horizontal pad keeps hardware off the first badge', () => {
  it('starts the name row after the top-left L-bracket arm', () => {
    const out = layout({
      screenX: 320,
      nameRowWidth: 80,
      nameRowHeight: 24,
      titleWidth: 0,
      slug: 'curators_gilt',
    });
    const tl = out.brackets[0];
    expect(tl.cornerX).toBe(out.outer.x + 1);
    expect(tl.endX).toBe(out.outer.x + 7);
    expect(out.nameRowLeft).toBe(280);
    expect(out.nameRowLeft).toBeGreaterThan(tl.endX);
    expect(out.nameRowLeft - out.outer.x).toBe(9);
  });
});

describe('E7 AI / Cheater chips stay in the name row, vertically centered', () => {
  it('places the shared name-row baseline inside the row box, not on the well floor', () => {
    const out = layout({
      nameRowHeight: 24,
      nameRowBottomY: 200,
      slug: 'deepward',
    });
    expect(out.nameBaseline).toBeGreaterThan(out.nameRowTop);
    expect(out.nameBaseline).toBeLessThan(out.nameRowTop + 24);
    expect(out.nameBaseline).toBe(193);
    expect(out.nameBaseline).toBeLessThan(200);
  });
});

describe('E8 AFK / role width follows the measured string', () => {
  it('does not clip a long measured name row', () => {
    const out = layout({
      nameRowWidth: 220,
      titleWidth: 40,
      slug: 'prestige_laurels',
    });
    expect(out.outer.w).toBe(238);
    expect(out.nameRowLeft).toBe(out.outer.x + 9);
    expect(out.nameRowLeft + 220).toBe(out.outer.x + out.outer.w - 9);
  });
});

describe('E10 current target: 18px min row, plaque scales with the row', () => {
  it('uses the 18px row height instead of a second layout', () => {
    const out = layout({
      nameRowHeight: 18,
      nameRowWidth: 70,
      titleWidth: 0,
      slug: 'deepward',
    });
    expect(out.outer.h).toBe(28);
    expect(out.nameRowTop).toBe(182);
    expect(out.nameBaseline).toBe(196);
  });
});

describe('E15 unknown / empty / title-deed slug: no plaque', () => {
  it('returns an inactive record for an empty slug', () => {
    const out = layout({ slug: '' });
    expect(out.active).toBe(false);
    expect(out.extraLift).toBe(0);
    expect(out.well.w).toBe(0);
    expect(out.well.h).toBe(0);
    expect(out.outer.w).toBe(0);
    expect(out.clasp.w).toBe(0);
    expect(out.brackets[0].endX).toBe(0);
    expect(out.brackets[1].endX).toBe(0);
    expect(out.brackets[2].endX).toBe(0);
    expect(out.brackets[3].endX).toBe(0);
  });

  it('still reports name-row origins so a borderless drawer can share centering', () => {
    const out = layout({
      slug: '',
      screenX: 320,
      nameRowBottomY: 200,
      nameRowWidth: 70,
      nameRowHeight: 16,
    });
    expect(out.nameRowLeft).toBe(285);
    expect(out.nameRowTop).toBe(184);
    expect(out.nameBaseline).toBe(197);
  });
});

describe('E21 borderless plate: no well, no hardware, title stays on its own line', () => {
  it('leaves title geometry on the existing 11px / 9px step when inactive', () => {
    const out = layout({
      slug: '',
      titleWidth: 80,
      nameRowWidth: 70,
      nameRowHeight: 16,
      nameRowBottomY: 200,
    });
    expect(out.active).toBe(false);
    expect(out.well.h).toBe(0);
    expect(out.clasp.h).toBe(0);
    expect(out.titleBaseline).toBe(209);
    expect(out.extraLift).toBe(0);
  });
});

describe('extraLift is the shared y-walk delta', () => {
  it('reports 14 when a slug is active and 0 when it is not', () => {
    expect(layout({ slug: 'deepward' }).extraLift).toBe(14);
    expect(layout({ slug: 'reliquary_gilt', titleWidth: 90 }).extraLift).toBe(14);
    expect(layout({ slug: '' }).extraLift).toBe(0);
  });
});

describe('shared hardware: four L-brackets and one top clasp', () => {
  it('places brackets on the four outer corners and the clasp on the top center', () => {
    const out = layout({
      screenX: 320,
      nameRowBottomY: 200,
      nameRowWidth: 70,
      nameRowHeight: 16,
      titleWidth: 0,
      slug: 'deepward',
    });
    const [tl, tr, br, bl] = out.brackets;
    expect(tl.cornerX).toBe(277);
    expect(tl.cornerY).toBe(180);
    expect(tl.endX).toBe(283);
    expect(tl.endY).toBe(186);
    expect(tr.cornerX).toBe(363);
    expect(tr.cornerY).toBe(180);
    expect(tr.endX).toBe(357);
    expect(tr.endY).toBe(186);
    expect(br.cornerX).toBe(363);
    expect(br.cornerY).toBe(204);
    expect(br.endX).toBe(357);
    expect(br.endY).toBe(198);
    expect(bl.cornerX).toBe(277);
    expect(bl.cornerY).toBe(204);
    expect(bl.endX).toBe(283);
    expect(bl.endY).toBe(198);
    expect(out.clasp.w).toBe(10);
    expect(out.clasp.h).toBe(5);
    expect(out.clasp.x).toBe(315);
    expect(out.clasp.y).toBe(175);
    expect(out.clasp.y + out.clasp.h).toBe(out.outer.y + 1);
  });

  it('insets the inner hairline by 2.5px from the well', () => {
    const out = layout({ nameRowWidth: 70, nameRowHeight: 16, slug: 'deepward' });
    expect(out.inner.x).toBe(out.well.x + 2.5);
    expect(out.inner.y).toBe(out.well.y + 2.5);
    expect(out.inner.w).toBe(83);
    expect(out.inner.h).toBe(21);
  });
});

describe('E17 extraLift is CSS pixels, never DPR-scaled', () => {
  it('takes no dpr / uiScale field and always reports the same lift', () => {
    const source = read('src/render/nameplate_cartouche_core.ts');
    for (const token of ['dpr', 'devicePixelRatio', 'uiScale', 'pixelRatio']) {
      expect(source.includes(token), `core must not read ${token}`).toBe(false);
    }
    expect(source).toMatch(
      /export interface NameplateCartoucheInput \{\s*screenX: number;\s*nameRowBottomY: number;\s*nameRowWidth: number;\s*nameRowHeight: number;\s*titleWidth: number;\s*slug: string;\s*\}/,
    );
    expect(layout({ slug: 'deepward' }).extraLift).toBe(14);
    expect(layout({ slug: 'deepward', nameRowHeight: 24 }).extraLift).toBe(14);
  });
});

describe('E24 two bordered players stacked: declutter Y clears extraLift', () => {
  it('bumps the same-row threshold and stack pitch by the extra lift', () => {
    expect(OVERLAP_THRESHOLD_Y_PX).toBe(32);
    expect(STACK_OFFSET_PX).toBe(34);
    expect(STACK_OFFSET_PX).toBeGreaterThanOrEqual(16 + 14);
    expect(STACK_OFFSET_PX).toBeGreaterThan(20);
    expect(OVERLAP_THRESHOLD_Y_PX).toBeGreaterThan(18);
  });
});

describe('E25 / E26 identity is tier-invariant in the core', () => {
  it('takes no gfx, governor, or effects-profile argument', () => {
    const source = read('src/render/nameplate_cartouche_core.ts');
    for (const token of [
      'ui_effects_profile',
      'ui_tier_knobs',
      'render_budget',
      'RenderBudgetGovernor',
      'data-fx-level',
      'gfxTier',
      'fxTier',
      '--fx-shadow',
    ]) {
      expect(source.includes(token), `core must not read ${token}`).toBe(false);
    }
  });
});
