// Pure rule that keeps a zone POI label legible when a navigation badge (a
// delve door, a world passage, a live Rift entrance) is authored on the same
// spot. The badge allocator (map_window_view placeLandmarkBadge) may move a
// badge at most MAP_LANDMARK_MAX_NUDGE_YD from the thing it marks, which is far
// less than a label is wide, so the LABEL yields: its baseline is lifted clear
// of the badge's top edge, or dropped under its bottom edge when the lift would
// leave the canvas. A label that is not touching a badge is never moved.
//
// Host-agnostic and DOM-free: canvas pixels in, canvas pixels out. Report:
// the Reliquary Hill label in Eastbrook Vale sat under the Collapsed Reliquary
// door badge because both are authored at the same world point.

import type { MapMarkerProfile } from './map_marker_profile_core';

/** Cap height of the POI label font per marker profile, in canvas pixels.
 *  Mirrors map_window_painter's per-profile labelFont sizes ('bold 13px' /
 *  'bold 20px'); the label band is [my - height, my] because the sprite cache
 *  draws with an alphabetic baseline at my. */
export const MAP_POI_LABEL_HEIGHT_BY_PROFILE = Object.freeze({
  standard: 13,
  compact: 20,
} as const satisfies Readonly<Record<MapMarkerProfile, number>>);

/** Breathing room between a lifted label's baseline and the badge edge. */
export const MAP_POI_LABEL_BADGE_GAP = 2;

export interface PoiLabelAnchor {
  mx: number;
  my: number;
}

export interface BadgeFootprint {
  mx: number;
  my: number;
}

/** True when the label band [my - labelHeight, my] around (mx, my) touches the
 *  square badge footprint of `badgeSize` centered on the badge. Horizontally
 *  the label's real width is locale-dependent and unknown here, so the badge
 *  box is only widened by one label height: this catches a badge authored on
 *  (or beside) the named place without claiming a label it merely neighbours. */
export function poiLabelTouchesBadge(
  label: PoiLabelAnchor,
  badge: BadgeFootprint,
  badgeSize: number,
  labelHeight: number,
): boolean {
  const half = badgeSize / 2;
  const dx = Math.abs(label.mx - badge.mx);
  if (dx > half + labelHeight) return false;
  const badgeTop = badge.my - half;
  const badgeBottom = badge.my + half;
  const labelTop = label.my - labelHeight;
  const labelBottom = label.my;
  return labelBottom > badgeTop && labelTop < badgeBottom;
}

/** Return the label anchors with every badge-covered label moved clear of the
 *  first badge it touches. Above the badge by default; below it when the lifted
 *  band would leave the canvas top. Untouched labels are returned as-is (same
 *  object), so a caller can tell which ones moved. */
export function clearPoiLabelsOffBadges<T extends PoiLabelAnchor>(
  labels: readonly T[],
  badges: readonly BadgeFootprint[],
  badgeSize: number,
  labelHeight: number,
): T[] {
  if (badges.length === 0) return labels.slice();
  const half = badgeSize / 2;
  return labels.map((label) => {
    const badge = badges.find((b) => poiLabelTouchesBadge(label, b, badgeSize, labelHeight));
    if (!badge) return label;
    const above = badge.my - half - MAP_POI_LABEL_BADGE_GAP;
    const my =
      above - labelHeight >= 0 ? above : badge.my + half + MAP_POI_LABEL_BADGE_GAP + labelHeight;
    return { ...label, my };
  });
}
