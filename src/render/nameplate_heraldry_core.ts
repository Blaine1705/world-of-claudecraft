// Book of Deeds world heraldry geometry. This pure core keeps the name row
// centered while attaching one forged seal to a shallow ribbon. The canvas
// owns paint and normalized motif lines; callers own and reuse this output.

import {
  type BorderMotifKind,
  borderAccent,
  DEED_HERALDRY_WELL_FILL,
} from '../ui/deed_border_view';

export const NAMEPLATE_HERALDRY_RIBBON_PAD_X = 7;
export const NAMEPLATE_HERALDRY_RIBBON_PAD_Y = 1;
export const NAMEPLATE_HERALDRY_RIBBON_RADIUS = 2;
export const NAMEPLATE_HERALDRY_WELL_ALPHA = 0.48;
export const NAMEPLATE_HERALDRY_WELL_FILL = DEED_HERALDRY_WELL_FILL;
export const NAMEPLATE_HERALDRY_SEAL_SIZE = 18;
export const NAMEPLATE_HERALDRY_SEAL_RIBBON_OVERLAP = 3;
export const NAMEPLATE_HERALDRY_EXTRA_LIFT = 8;
export const NAMEPLATE_HERALDRY_TITLE_STEP = 11;
export const NAMEPLATE_HERALDRY_TITLE_BASELINE = 9;
export const NAMEPLATE_HERALDRY_NAME_BASELINE_FROM_CENTER = 5;

const NAMEPLATE_HERALDRY_JOINT_HEIGHT = 8;
const NAMEPLATE_HERALDRY_MOTIF_SCALE = 6;

export interface NameplateHeraldryRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NameplateHeraldrySeal {
  x: number;
  y: number;
  size: number;
}

export interface NameplateHeraldryPoint {
  x: number;
  y: number;
}

export type NameplateHeraldryMotifKind = BorderMotifKind | '';

export interface NameplateHeraldryInput {
  screenX: number;
  nameRowBottomY: number;
  nameRowWidth: number;
  nameRowHeight: number;
  slug: string;
}

export interface NameplateHeraldry {
  active: boolean;
  extraLift: number;
  ribbon: NameplateHeraldryRect;
  ribbonRadius: number;
  seal: NameplateHeraldrySeal;
  joint: NameplateHeraldryRect;
  rivets: [NameplateHeraldryPoint, NameplateHeraldryPoint];
  motifKind: NameplateHeraldryMotifKind;
  motifCenterX: number;
  motifCenterY: number;
  motifScale: number;
  nameRowLeft: number;
  nameRowTop: number;
  nameBaseline: number;
  titleBaseline: number;
  titleCenterX: number;
}

function writeRect(rect: NameplateHeraldryRect, x: number, y: number, w: number, h: number): void {
  rect.x = x;
  rect.y = y;
  rect.w = w;
  rect.h = h;
}

function zeroHeraldry(out: NameplateHeraldry): void {
  out.active = false;
  out.extraLift = 0;
  writeRect(out.ribbon, 0, 0, 0, 0);
  out.ribbonRadius = 0;
  out.seal.x = 0;
  out.seal.y = 0;
  out.seal.size = 0;
  writeRect(out.joint, 0, 0, 0, 0);
  out.rivets[0].x = 0;
  out.rivets[0].y = 0;
  out.rivets[1].x = 0;
  out.rivets[1].y = 0;
  out.motifKind = '';
  out.motifCenterX = 0;
  out.motifCenterY = 0;
  out.motifScale = 0;
}

export function createNameplateHeraldry(): NameplateHeraldry {
  return {
    active: false,
    extraLift: 0,
    ribbon: { x: 0, y: 0, w: 0, h: 0 },
    ribbonRadius: 0,
    seal: { x: 0, y: 0, size: 0 },
    joint: { x: 0, y: 0, w: 0, h: 0 },
    rivets: [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
    motifKind: '',
    motifCenterX: 0,
    motifCenterY: 0,
    motifScale: 0,
    nameRowLeft: 0,
    nameRowTop: 0,
    nameBaseline: 0,
    titleBaseline: 0,
    titleCenterX: 0,
  };
}

/** Fill and return the caller-owned world heraldry record. */
export function nameplateHeraldryInto(
  out: NameplateHeraldry,
  input: NameplateHeraldryInput,
): NameplateHeraldry {
  const nameRowWidth = Math.max(0, input.nameRowWidth);
  const nameRowHeight = Math.max(0, input.nameRowHeight);
  out.nameRowLeft = input.screenX - nameRowWidth / 2;
  out.nameRowTop = input.nameRowBottomY - nameRowHeight;
  out.nameBaseline =
    out.nameRowTop + nameRowHeight / 2 + NAMEPLATE_HERALDRY_NAME_BASELINE_FROM_CENTER;
  out.titleBaseline = input.nameRowBottomY + NAMEPLATE_HERALDRY_TITLE_BASELINE;
  out.titleCenterX = input.screenX;

  const accent = borderAccent(input.slug);
  if (!accent) {
    zeroHeraldry(out);
    return out;
  }

  const ribbonX = out.nameRowLeft - NAMEPLATE_HERALDRY_RIBBON_PAD_X;
  const ribbonY = out.nameRowTop - NAMEPLATE_HERALDRY_RIBBON_PAD_Y;
  const ribbonWidth = nameRowWidth + NAMEPLATE_HERALDRY_RIBBON_PAD_X * 2;
  const ribbonHeight = nameRowHeight + NAMEPLATE_HERALDRY_RIBBON_PAD_Y * 2;
  const sealX = ribbonX - (NAMEPLATE_HERALDRY_SEAL_SIZE - NAMEPLATE_HERALDRY_SEAL_RIBBON_OVERLAP);
  const sealY = ribbonY + (ribbonHeight - NAMEPLATE_HERALDRY_SEAL_SIZE) / 2;
  const jointY = sealY + (NAMEPLATE_HERALDRY_SEAL_SIZE - NAMEPLATE_HERALDRY_JOINT_HEIGHT) / 2;
  const rivetX = ribbonX + NAMEPLATE_HERALDRY_SEAL_RIBBON_OVERLAP / 2;

  out.active = true;
  out.extraLift = NAMEPLATE_HERALDRY_EXTRA_LIFT;
  writeRect(out.ribbon, ribbonX, ribbonY, ribbonWidth, ribbonHeight);
  out.ribbonRadius = NAMEPLATE_HERALDRY_RIBBON_RADIUS;
  out.seal.x = sealX;
  out.seal.y = sealY;
  out.seal.size = NAMEPLATE_HERALDRY_SEAL_SIZE;
  writeRect(
    out.joint,
    ribbonX,
    jointY,
    NAMEPLATE_HERALDRY_SEAL_RIBBON_OVERLAP,
    NAMEPLATE_HERALDRY_JOINT_HEIGHT,
  );
  out.rivets[0].x = rivetX;
  out.rivets[0].y = jointY + 2;
  out.rivets[1].x = rivetX;
  out.rivets[1].y = jointY + NAMEPLATE_HERALDRY_JOINT_HEIGHT - 2;
  out.motifKind = accent.motif;
  out.motifCenterX = sealX + NAMEPLATE_HERALDRY_SEAL_SIZE / 2;
  out.motifCenterY = sealY + NAMEPLATE_HERALDRY_SEAL_SIZE / 2;
  out.motifScale = NAMEPLATE_HERALDRY_MOTIF_SCALE;
  return out;
}
