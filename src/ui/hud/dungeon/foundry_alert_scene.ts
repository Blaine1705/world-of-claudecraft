// The Stormbrass Foundry alert's scene: the bodies the alert reads that are not
// on the local player (the Rangewarden for its Proof Shot aim, the Voltaic
// Warden and its plated drones for the plating readout, the Prime Draft and
// the Storm Cells on the floor). Pure and DOM-free: it walks the world's
// entities ONLY when the roster changed (an entity came or went: the
// entityRosterVersion the creature fx key on too) and keeps the references,
// so a still frame costs a version compare. A cell settling from rolling to
// ready changes its template, not the roster; the view reads the live
// template off the kept reference.

import {
  ARC_DRONE_ID,
  FOUNDRY_CELL_TEMPLATES,
  PRIME_DRAFT_ID,
  RANGEWARDEN_ID,
  VOLTAIC_WARDEN_ID,
} from '../../../sim/encounters/stormbrass_foundry/ids';
import type { FoundryAlertEntity, FoundryAlertScene } from './foundry_alert_view';

export interface FoundrySceneEntity extends FoundryAlertEntity {
  kind?: string;
  templateId: string;
}

export interface FoundrySceneWorld {
  entities: ReadonlyMap<number, FoundrySceneEntity>;
  entityRosterVersion: number;
}

function isCell(templateId: string): boolean {
  return (
    templateId === FOUNDRY_CELL_TEMPLATES.ready || templateId === FOUNDRY_CELL_TEMPLATES.rolling
  );
}

/** A living boss over a fallen one (a corpse can share the roster). */
function pick(have: FoundryAlertEntity | null, e: FoundrySceneEntity): FoundryAlertEntity {
  return have && !have.dead ? have : e;
}

export class FoundryAlertSceneScan {
  private version = Number.NaN;
  private readonly drones: FoundrySceneEntity[] = [];
  private readonly cells: FoundrySceneEntity[] = [];
  private readonly scene: FoundryAlertScene = {
    rangewarden: null,
    warden: null,
    draft: null,
    drones: this.drones,
    cells: this.cells,
  };

  /** The scene for this frame (the same object every frame). */
  update(world: FoundrySceneWorld): FoundryAlertScene {
    if (world.entityRosterVersion === this.version) return this.scene;
    this.version = world.entityRosterVersion;
    this.scene.rangewarden = null;
    this.scene.warden = null;
    this.scene.draft = null;
    this.drones.length = 0;
    this.cells.length = 0;
    for (const e of world.entities.values()) {
      const id = e.templateId;
      if (e.kind === 'object') {
        if (isCell(id)) this.cells.push(e);
        continue;
      }
      if (id === RANGEWARDEN_ID) this.scene.rangewarden = pick(this.scene.rangewarden, e);
      else if (id === VOLTAIC_WARDEN_ID) this.scene.warden = pick(this.scene.warden, e);
      else if (id === PRIME_DRAFT_ID) this.scene.draft = pick(this.scene.draft, e);
      else if (id === ARC_DRONE_ID) this.drones.push(e);
    }
    return this.scene;
  }
}
