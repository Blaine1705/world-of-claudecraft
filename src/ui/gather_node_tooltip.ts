// Gather-node world-hover tooltip (Professions 2.0): desktop pointer
// only. Hovering an ore vein / timber stand / herb patch in the 3D scene shows
// the node's name, its tool requirement (#2343: every node requires its
// profession's tool, so tier-1 nodes show the tierless base-tool line and
// tier 2+ the tiered one), and its per-viewer ready/cooldown state. Mobile
// has no hover surface: touch players read the minimap lock tint (which since
// R22 means no USABLE tool: covering-but-unwieldable locks too) and the
// gatherDenied error toast instead.
//
// Reuses the HUD's shared #tooltip container and the paintTooltipAt idiom
// (hud.ts): same box, same +14/-10 cursor offsets, same author-space viewport
// clamp via getUiScale. paintTooltipAt itself is Hud-private, so the paint is
// replicated here rather than a new tooltip system invented; hiding goes
// through the PUBLIC hud.hideTooltip() so the shared-owner release (#1626)
// stays consistent. Content comes from the pure buildGatherNodeTooltip core
// (gathering_view.ts), which tests drive directly.
//
// Identical on every graphics preset and FPS tier: the tier requirement is
// actionable info (fairness invariant), so nothing here reads
// ui_effects_profile or the governor.

import type { GatheringProfessionId } from '../sim/content/professions';
import { ITEMS } from '../sim/data';
import { NODE_HARVEST_TABLE } from '../sim/professions/gathering';
import { canGatherTier } from '../sim/professions/tools';
import { minWieldRequirementToWork } from '../sim/professions/wield_gate';
import type { GatherNodeDef, GatherNodeType } from '../sim/types';
import type { IWorld } from '../world_api';
import { esc } from './esc';
import {
  buildGatherNodeTooltip,
  type GatherNodeTooltipModel,
  viewerUsableToolTier,
} from './gathering_view';
import { formatNumber, type TranslationKey, t } from './i18n';
import { getUiScale } from './ui_scale';

// Re-pick cadence floor: world raycasts are the expensive half of hover (see
// main.ts HoverPickGate), so the pointer stream is throttled well below the
// display rate. State (ready/cooldown) also refreshes at this cadence.
const PICK_THROTTLE_MS = 120;

const NODE_NAME_KEYS: Record<GatherNodeType, string> = {
  ore: 'hudChrome.gathering.nodeName.ore',
  wood: 'hudChrome.gathering.nodeName.wood',
  herb: 'hudChrome.gathering.nodeName.herb',
};

// Keyed per profession, never composed from fragments (single-key
// interpolation only); fishing never appears (no fishing world nodes).
const TIER_REQUIRED_KEYS: Partial<Record<GatheringProfessionId, string>> = {
  mining: 'hudChrome.gathering.tierRequired.mining',
  logging: 'hudChrome.gathering.tierRequired.logging',
  herbalism: 'hudChrome.gathering.tierRequired.herbalism',
};

// The tierless requirement line for tier-1 nodes (#2343: bare hands never
// gather, so even a tier-1 node names its base tool).
const REQUIRES_TOOL_KEYS: Partial<Record<GatheringProfessionId, string>> = {
  mining: 'hudChrome.gathering.requiresTool.mining',
  logging: 'hudChrome.gathering.requiresTool.logging',
  herbalism: 'hudChrome.gathering.requiresTool.herbalism',
};

/** The tooltip's inner HTML for one resolved node model. Exported for the
 *  hover module's own use; all copy resolves through t() here (the pure core
 *  stays i18n-free). */
export function gatherNodeTooltipHtml(model: GatherNodeTooltipModel): string {
  const name = t(NODE_NAME_KEYS[model.type] as TranslationKey);
  let html = `<div class="tt-title">${esc(name)}</div>`;
  // The R22 wield arm outranks the tier line: when the model carries a
  // wield shortfall, the viewer already OWNS a covering tool and "Requires a
  // tier N pick" would name a requirement they meet. The hover surface says
  // the same thing the click toast and the sim's denial would.
  const reqKey =
    model.locked && model.wieldSkill
      ? WIELD_UNMET_KEYS[model.type]
      : model.tier > 1
        ? TIER_REQUIRED_KEYS[model.professionId]
        : REQUIRES_TOOL_KEYS[model.professionId];
  if (reqKey) {
    const line = t(reqKey as TranslationKey, {
      tier: formatNumber(model.tier, { maximumFractionDigits: 0 }),
      skill: formatNumber(model.wieldSkill ?? 0, { maximumFractionDigits: 0 }),
    });
    // Red only while the viewer's best USABLE tool falls short (owned but
    // unearned locks too, R22), mirroring the item-tooltip unmet idiom.
    html += `<div class="${model.locked ? 'tt-red' : 'tt-sub'}">${esc(line)}</div>`;
  }
  const stateKey =
    model.state === 'ready'
      ? 'hudChrome.gathering.stateReady'
      : 'hudChrome.gathering.stateCooldown';
  html += `<div class="${model.state === 'ready' ? 'tt-green' : 'tt-sub'}">${esc(t(stateKey as TranslationKey))}</div>`;
  return html;
}

const TOOL_TIER_UNMET_KEYS: Record<GatherNodeType, string> = {
  ore: 'hudChrome.gathering.toolTierUnmet.mining',
  wood: 'hudChrome.gathering.toolTierUnmet.logging',
  herb: 'hudChrome.gathering.toolTierUnmet.herbalism',
};

// Tierless denial lines for tier-1 nodes (#2343: requiredTier 1 means "no
// tool owned at all", so no tier number is named).
const TOOL_REQUIRED_KEYS: Record<GatherNodeType, string> = {
  ore: 'hudChrome.gathering.toolRequired.mining',
  wood: 'hudChrome.gathering.toolRequired.logging',
  herb: 'hudChrome.gathering.toolRequired.herbalism',
};

// The R22 wield arm's lines: a covering tool is in the bags and only the
// counter is short, so the actionable number is {skill}, not a tier. The
// same key family the sim's wieldProficiency-carrying gatherDenied renders.
const WIELD_UNMET_KEYS: Record<GatherNodeType, string> = {
  ore: 'hudChrome.gathering.wieldUnmet.mining',
  wood: 'hudChrome.gathering.wieldUnmet.logging',
  herb: 'hudChrome.gathering.wieldUnmet.herbalism',
};

/** The client-side tool pre-gate for one node, with the localized denial
 *  line already resolved for exactly this node (this module is the gathering
 *  copy surface, so main.ts wires it in one line). Structurally matches
 *  gather_node_interact.ts GatherNodeToolGate; the server stays authoritative
 *  either way (a stale read still answers gatherDenied). `viewerToolTier` is
 *  the unfloored USABLE tier (0 = nothing owned or nothing wieldable, #2343
 *  plus R22), so the shared canGatherTier
 *  comparison locks every node, tier 1 included, for a toolless viewer. */
export function gatherNodeToolGateFor(
  world: IWorld,
  node: Pick<GatherNodeDef, 'type' | 'tier'>,
): { nodeTier: number; viewerToolTier: number; unmetText: string } {
  const professionId = NODE_HARVEST_TABLE[node.type].professionId;
  const viewerToolTier = viewerUsableToolTier(world, professionId);
  // The wield split, mirroring the sim's denial choice exactly: when a
  // covering tool is already carried and only its counter is short
  // (minWieldRequirementToWork non-null), the line names the counter; the
  // tier and no-tool lines keep their arms otherwise. Client and sim share
  // the resolvers, so the toast the pre-verdict composes is the toast the
  // server's own denial would render.
  const wieldReq = minWieldRequirementToWork(world.inventory, professionId, node.tier, ITEMS);
  const wieldLocked =
    !canGatherTier(viewerToolTier, node.tier) && wieldReq !== null && wieldReq > 0;
  const unmetKey = wieldLocked
    ? WIELD_UNMET_KEYS[node.type]
    : node.tier > 1
      ? TOOL_TIER_UNMET_KEYS[node.type]
      : TOOL_REQUIRED_KEYS[node.type];
  return {
    nodeTier: node.tier,
    viewerToolTier,
    unmetText: t(unmetKey as TranslationKey, {
      tier: formatNumber(node.tier, { maximumFractionDigits: 0 }),
      skill: formatNumber(wieldReq ?? 0, { maximumFractionDigits: 0 }),
    }),
  };
}

export interface GatherNodeTooltipHud {
  hideTooltip(): void;
}

/**
 * Wire the hover tooltip onto the 3D canvas. `pickEntity` mirrors the click
 * path's priority (main.ts handlePick: a direct entity hit always wins), so
 * the node tip never fights the mob/player hover tooltip for the shared box;
 * `pointerBusy` is the caller's drag gate. Pointer-locked mouselook and touch
 * pointers never show it.
 */
export function attachGatherNodeHoverTooltip(
  canvas: HTMLElement,
  world: IWorld,
  hud: GatherNodeTooltipHud,
  pickGatherNode: (clientX: number, clientY: number) => string | null,
  pickEntity: (clientX: number, clientY: number) => number | null,
  pointerBusy: () => boolean,
): void {
  const tooltipEl = document.getElementById('tooltip');
  if (!tooltipEl) return;
  let lastPickAt = 0;
  let shown = false;

  // Only ever hide the shared box when THIS module painted it (the
  // hideMapAreaTip idiom), so an unrelated owner's tooltip is never wiped.
  const hide = (): void => {
    if (!shown) return;
    shown = false;
    hud.hideTooltip();
  };

  const paintAt = (model: GatherNodeTooltipModel, x: number, y: number): void => {
    // The paintTooltipAt idiom: drop the mob-tooltip size modifier, fill,
    // then clamp the author-space box against the viewport (x/y arrive in
    // visual space, so divide by the UI scale first).
    tooltipEl.classList.remove('mob-tooltip');
    tooltipEl.innerHTML = gatherNodeTooltipHtml(model);
    tooltipEl.style.display = 'block';
    const z = getUiScale();
    const tw = tooltipEl.offsetWidth;
    const th = tooltipEl.offsetHeight;
    tooltipEl.style.left = `${Math.max(8, Math.min(window.innerWidth / z - tw - 8, x / z + 14))}px`;
    tooltipEl.style.top = `${Math.max(8, y / z - th - 10)}px`;
    shown = true;
  };

  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return; // touch has no hover
    if (document.pointerLockElement !== null || pointerBusy()) {
      hide();
      return;
    }
    const now = performance.now();
    if (now - lastPickAt < PICK_THROTTLE_MS) return;
    lastPickAt = now;
    // A direct entity hit always wins (the hover pipeline shows its own
    // mob/player tooltip in the fixed corner slot); only a bare node shows.
    const nodeId =
      pickEntity(ev.clientX, ev.clientY) === null ? pickGatherNode(ev.clientX, ev.clientY) : null;
    const model = nodeId !== null ? buildGatherNodeTooltip(world, nodeId) : null;
    if (model === null) {
      hide();
      return;
    }
    paintAt(model, ev.clientX, ev.clientY);
  });
  // Leaving the canvas (including onto an overlaying HUD window) or starting
  // any press (a click harvests or moves) dismisses the tip.
  canvas.addEventListener('pointerleave', hide);
  canvas.addEventListener('pointerdown', hide);
}
