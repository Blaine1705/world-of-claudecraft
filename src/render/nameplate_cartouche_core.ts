// Book of Deeds nameplate cartouche geometry. DOM/Three/i18n-free so a Vitest
// drives it directly. The canvas is a thin consumer: this module owns pad,
// well, hardware, content origins, and the extraLift both y-walks apply.

export const NAMEPLATE_CARTOUCHE_PAD_X = 9;
export const NAMEPLATE_CARTOUCHE_PAD_Y = 5;
export const NAMEPLATE_CARTOUCHE_RADIUS = 6;
export const NAMEPLATE_CARTOUCHE_WELL_ALPHA = 0.4;
export const NAMEPLATE_CARTOUCHE_WELL_FILL = '#14110c';
export const NAMEPLATE_CARTOUCHE_TITLE_STEP = 11;
export const NAMEPLATE_CARTOUCHE_TITLE_BASELINE = 9;
export const NAMEPLATE_CARTOUCHE_NAME_BASELINE_FROM_CENTER = 5;
export const NAMEPLATE_CARTOUCHE_BRACKET_ARM = 6;
export const NAMEPLATE_CARTOUCHE_BRACKET_INSET = 1;
export const NAMEPLATE_CARTOUCHE_CLASP_WIDTH = 10;
export const NAMEPLATE_CARTOUCHE_CLASP_HEIGHT = 5;
export const NAMEPLATE_CARTOUCHE_CLASP_OVERLAP = 1;
export const NAMEPLATE_CARTOUCHE_INNER_INSET = 2.5;
export const NAMEPLATE_CARTOUCHE_EXTRA_LIFT =
  NAMEPLATE_CARTOUCHE_PAD_Y * 2 +
  (NAMEPLATE_CARTOUCHE_CLASP_HEIGHT - NAMEPLATE_CARTOUCHE_CLASP_OVERLAP);

export interface CartoucheRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CartoucheBracket {
  cornerX: number;
  cornerY: number;
  endX: number;
  endY: number;
}

export interface CartoucheClasp {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NameplateCartoucheInput {
  screenX: number;
  nameRowBottomY: number;
  nameRowWidth: number;
  nameRowHeight: number;
  titleWidth: number;
  slug: string;
}

export interface NameplateCartouche {
  active: boolean;
  extraLift: number;
  outer: CartoucheRect;
  well: CartoucheRect;
  inner: CartoucheRect;
  radius: number;
  innerRadius: number;
  brackets: [CartoucheBracket, CartoucheBracket, CartoucheBracket, CartoucheBracket];
  clasp: CartoucheClasp;
  nameRowLeft: number;
  nameRowTop: number;
  nameBaseline: number;
  titleBaseline: number;
  titleCenterX: number;
}

function makeRect(): CartoucheRect {
  return { x: 0, y: 0, w: 0, h: 0 };
}

function makeBracket(): CartoucheBracket {
  return { cornerX: 0, cornerY: 0, endX: 0, endY: 0 };
}

function writeRect(rect: CartoucheRect, x: number, y: number, w: number, h: number): void {
  rect.x = x;
  rect.y = y;
  rect.w = w;
  rect.h = h;
}

function writeBracket(
  bracket: CartoucheBracket,
  cornerX: number,
  cornerY: number,
  endX: number,
  endY: number,
): void {
  bracket.cornerX = cornerX;
  bracket.cornerY = cornerY;
  bracket.endX = endX;
  bracket.endY = endY;
}

function zeroPlaque(out: NameplateCartouche): void {
  out.active = false;
  out.extraLift = 0;
  out.radius = 0;
  out.innerRadius = 0;
  writeRect(out.outer, 0, 0, 0, 0);
  writeRect(out.well, 0, 0, 0, 0);
  writeRect(out.inner, 0, 0, 0, 0);
  writeBracket(out.brackets[0], 0, 0, 0, 0);
  writeBracket(out.brackets[1], 0, 0, 0, 0);
  writeBracket(out.brackets[2], 0, 0, 0, 0);
  writeBracket(out.brackets[3], 0, 0, 0, 0);
  out.clasp.x = 0;
  out.clasp.y = 0;
  out.clasp.w = 0;
  out.clasp.h = 0;
}

function writeOrigins(out: NameplateCartouche, input: NameplateCartoucheInput): void {
  const nameRowWidth = Math.max(0, input.nameRowWidth);
  const nameRowHeight = Math.max(0, input.nameRowHeight);
  out.nameRowLeft = input.screenX - nameRowWidth / 2;
  out.nameRowTop = input.nameRowBottomY - nameRowHeight;
  out.nameBaseline =
    out.nameRowTop + nameRowHeight / 2 + NAMEPLATE_CARTOUCHE_NAME_BASELINE_FROM_CENTER;
  out.titleBaseline = input.nameRowBottomY + NAMEPLATE_CARTOUCHE_TITLE_BASELINE;
  out.titleCenterX = input.screenX;
}

export function createNameplateCartouche(): NameplateCartouche {
  return {
    active: false,
    extraLift: 0,
    outer: makeRect(),
    well: makeRect(),
    inner: makeRect(),
    radius: 0,
    innerRadius: 0,
    brackets: [makeBracket(), makeBracket(), makeBracket(), makeBracket()],
    clasp: { x: 0, y: 0, w: 0, h: 0 },
    nameRowLeft: 0,
    nameRowTop: 0,
    nameBaseline: 0,
    titleBaseline: 0,
    titleCenterX: 0,
  };
}

/**
 * Fill `out` with the cartouche for `input` and return `out`. Empty slug: no
 * plaque, origins still written so a borderless drawer can share centering.
 */
export function nameplateCartoucheInto(
  out: NameplateCartouche,
  input: NameplateCartoucheInput,
): NameplateCartouche {
  writeOrigins(out, input);
  if (!input.slug) {
    zeroPlaque(out);
    return out;
  }

  const nameRowWidth = Math.max(0, input.nameRowWidth);
  const nameRowHeight = Math.max(0, input.nameRowHeight);
  const titleWidth = Math.max(0, input.titleWidth);
  const titleBlock = titleWidth > 0 ? NAMEPLATE_CARTOUCHE_TITLE_STEP : 0;
  const contentW = Math.max(nameRowWidth, titleWidth);
  const outerW = contentW + NAMEPLATE_CARTOUCHE_PAD_X * 2;
  const outerH = nameRowHeight + titleBlock + NAMEPLATE_CARTOUCHE_PAD_Y * 2;
  const outerX = input.screenX - outerW / 2;
  const outerY = out.nameRowTop - NAMEPLATE_CARTOUCHE_PAD_Y;
  const inset = NAMEPLATE_CARTOUCHE_BRACKET_INSET;
  const arm = NAMEPLATE_CARTOUCHE_BRACKET_ARM;
  const left = outerX + inset;
  const right = outerX + outerW - inset;
  const top = outerY + inset;
  const bottom = outerY + outerH - inset;

  out.active = true;
  out.extraLift = NAMEPLATE_CARTOUCHE_EXTRA_LIFT;
  out.radius = NAMEPLATE_CARTOUCHE_RADIUS;
  out.innerRadius = Math.max(0, NAMEPLATE_CARTOUCHE_RADIUS - NAMEPLATE_CARTOUCHE_INNER_INSET);
  writeRect(out.outer, outerX, outerY, outerW, outerH);
  writeRect(out.well, outerX, outerY, outerW, outerH);
  writeRect(
    out.inner,
    outerX + NAMEPLATE_CARTOUCHE_INNER_INSET,
    outerY + NAMEPLATE_CARTOUCHE_INNER_INSET,
    Math.max(0, outerW - NAMEPLATE_CARTOUCHE_INNER_INSET * 2),
    Math.max(0, outerH - NAMEPLATE_CARTOUCHE_INNER_INSET * 2),
  );
  writeBracket(out.brackets[0], left, top, left + arm, top + arm);
  writeBracket(out.brackets[1], right, top, right - arm, top + arm);
  writeBracket(out.brackets[2], right, bottom, right - arm, bottom - arm);
  writeBracket(out.brackets[3], left, bottom, left + arm, bottom - arm);
  out.clasp.w = NAMEPLATE_CARTOUCHE_CLASP_WIDTH;
  out.clasp.h = NAMEPLATE_CARTOUCHE_CLASP_HEIGHT;
  out.clasp.x = outerX + (outerW - NAMEPLATE_CARTOUCHE_CLASP_WIDTH) / 2;
  out.clasp.y = outerY - (NAMEPLATE_CARTOUCHE_CLASP_HEIGHT - NAMEPLATE_CARTOUCHE_CLASP_OVERLAP);
  return out;
}
