// The trash engine's use prompt (G3): the pure, DOM-free view core. A usable
// encounter body (a mob template's `trashKit.usable`, the Soul Brazier a
// Pyre-Tender plants) is kicked over with the INTERACT press: the press ladder
// (src/game/nearby_interaction_core.ts, its 'use' arm) targets the nearest
// living one within its use reach and sends the ordinary interact, which the
// authoritative sim validates (mob/trash_kit/encounter_use.ts). This view
// tells the local player it is there and how to do it, on exactly the press
// ladder's boundary: within the use's own `range` it offers the press (the
// interact key's keycap on a keyboard, a tap line on touch, a click line when
// interact is unbound; the panel itself is then a button doing the same
// target and interact), and a little farther out (KIT_USE_PROMPT_RADIUS) it
// says how close to come. While the local player's own use runs, it shows the
// use's bar and what breaks it. The painter is the shared encounter alert's
// (encounter_alert_painter.ts), mounted by DungeonPrompts.

import { MOBS } from '../../../sim/data';
import { isKitUseCast, type KitUseDef } from '../../../sim/types';
import { castDisplayName } from '../../cast_display_name';
import { tEntity } from '../../entity_i18n';
import { formatNumber, t } from '../../i18n';
import type { EncounterAlertHidden, EncounterAlertLive } from './encounter_alert_view';

export type KitUsePromptKind = 'use' | 'use-far' | 'using';

/** Every kind class the painter toggles (the CSS keys on them). */
export const KIT_USE_PROMPT_KINDS: readonly KitUsePromptKind[] = ['use', 'use-far', 'using'];

/** How near (yards, flat) a usable body must stand before the prompt shows at
 *  all; inside the use's own `range` it offers the press. */
export const KIT_USE_PROMPT_RADIUS = 6;

export type KitUsePromptLive = Omit<EncounterAlertLive, 'kind'> & {
  kind: KitUsePromptKind;
  /** The body a press on the panel targets before it interacts (-1 when the
   *  panel takes no press). */
  bodyId: number;
};
export type KitUsePromptView = KitUsePromptLive | EncounterAlertHidden;

const HIDDEN: EncounterAlertHidden = { visible: false };

/** A body the prompt reads (any entity; only a mob with a usable kit counts). */
export interface KitUseBody {
  id: number;
  kind?: string;
  templateId: string;
  dead?: boolean;
  hp?: number;
  pos: { x: number; z: number };
}

export interface KitUsePromptInput {
  self: {
    pos: { x: number; z: number };
    dead?: boolean;
    castingAbility?: string | null;
    castTargetId?: number | null;
    castRemaining?: number;
    castTotal?: number;
  };
  /** The usable bodies in the world (KitUseSceneScan), alive or not. */
  bodies: readonly KitUseBody[];
  entity: (id: number) => KitUseBody | null | undefined;
  /** The interact key's label ('' when unbound). */
  interactKey: string;
  touch: boolean;
}

/** The use a body carries, or null: the sim's own rule (encounter_use.ts
 *  kitUseOf), read structurally so the view needs no full Entity. */
export function kitUseDefOf(body: KitUseBody | null | undefined): KitUseDef | null {
  if (!body || body.kind !== 'mob') return null;
  return MOBS[body.templateId]?.trashKit?.usable ?? null;
}

/** Alive and usable right now (encounter_use.ts kitUsableNow). */
function usableNow(body: KitUseBody): boolean {
  return !body.dead && (body.hp ?? 1) > 0 && kitUseDefOf(body) !== null;
}

function nameOf(body: KitUseBody): string {
  return tEntity({ kind: 'mob', id: body.templateId, field: 'name' });
}

function timeAria(seconds: number): string {
  return t('hudChrome.kitUse.timeAria', {
    seconds: formatNumber(Math.max(0, Math.ceil(seconds)), { maximumFractionDigits: 0 }),
  });
}

/** The pick the prompt (and the press ladder, by the same rule) lands on: the
 *  nearest living usable body within `radius`, or null. */
export function nearestUsableBody(
  pos: { x: number; z: number },
  bodies: readonly KitUseBody[],
  radius: number,
): { body: KitUseBody; def: KitUseDef; distance: number } | null {
  let best: { body: KitUseBody; def: KitUseDef; distance: number } | null = null;
  for (const body of bodies) {
    if (!usableNow(body)) continue;
    const def = kitUseDefOf(body);
    if (!def) continue;
    const distance = Math.hypot(body.pos.x - pos.x, body.pos.z - pos.z);
    if (distance > radius || (best && distance >= best.distance)) continue;
    best = { body, def, distance };
  }
  return best;
}

export function buildKitUsePromptView(input: KitUsePromptInput): KitUsePromptView {
  const self = input.self;
  if (self.dead) return HIDDEN;

  // The local player's own use is running: its bar, and what breaks it.
  if (isKitUseCast(self.castingAbility ?? null)) {
    const castId = self.castingAbility as string;
    const total = self.castTotal ?? 0;
    const remaining = self.castRemaining ?? 0;
    const target = self.castTargetId !== null && self.castTargetId !== undefined;
    const body = target ? input.entity(self.castTargetId as number) : null;
    const title = castDisplayName(castId);
    return {
      visible: true,
      kind: 'using',
      title,
      line: t('hudChrome.kitUse.usingLine'),
      hint: '',
      key: '',
      progress: total > 0 ? Math.max(0, Math.min(1, 1 - remaining / total)) : null,
      progressAria: timeAria(remaining),
      pressable: false,
      buttonAria: body ? t('hudChrome.kitUse.toppleAria', { name: nameOf(body) }) : title,
      bodyId: -1,
    };
  }

  const pick = nearestUsableBody(self.pos, input.bodies, KIT_USE_PROMPT_RADIUS);
  if (!pick) return HIDDEN;
  const { body, def, distance } = pick;
  const name = nameOf(body);
  const title = name;
  const buttonAria = t('hudChrome.kitUse.toppleAria', { name });
  // Out of the use's reach: say how close to come; the panel takes no press
  // (the sim would only answer "Too far away.").
  if (distance > def.range) {
    return {
      visible: true,
      kind: 'use-far',
      title,
      line: t('hudChrome.kitUse.toppleFar', {
        range: formatNumber(def.range, { maximumFractionDigits: 1 }),
      }),
      hint: '',
      key: '',
      progress: null,
      progressAria: '',
      pressable: false,
      buttonAria,
      bodyId: -1,
    };
  }
  const key = input.touch ? '' : input.interactKey;
  const hint = input.touch
    ? t('hudChrome.kitUse.toppleTap', { name })
    : key
      ? t('hudChrome.kitUse.toppleKey', { name })
      : t('hudChrome.kitUse.toppleClick', { name });
  return {
    visible: true,
    kind: 'use',
    title,
    line: t('hudChrome.kitUse.toppleLine'),
    hint,
    key,
    progress: null,
    progressAria: '',
    pressable: true,
    buttonAria,
    bodyId: body.id,
  };
}

// ---- the scene: the usable bodies, rescanned only when the roster changes ----

export interface KitUseSceneWorld {
  entities: ReadonlyMap<number, KitUseBody>;
  entityRosterVersion: number;
}

/** The world's usable bodies: walks the entities ONLY when the roster changed
 *  and keeps the references (a body dying changes its fields, not the roster;
 *  the view reads them live). The same array every frame. */
export class KitUseSceneScan {
  private version = Number.NaN;
  private readonly bodies: KitUseBody[] = [];

  update(world: KitUseSceneWorld): readonly KitUseBody[] {
    if (world.entityRosterVersion === this.version) return this.bodies;
    this.version = world.entityRosterVersion;
    this.bodies.length = 0;
    for (const e of world.entities.values()) if (kitUseDefOf(e)) this.bodies.push(e);
    return this.bodies;
  }
}
