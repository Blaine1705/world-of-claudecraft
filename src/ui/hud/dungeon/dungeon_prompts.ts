// The dungeon encounter prompts the HUD composes as ONE member with ONE frame
// call: the Iron Cage escape (cage_escape_*), Gaoler Ossick's chain alert
// (gaol_chain_*) and the Stormbrass Foundry's alert (foundry_alert_*: the
// Storm Cell, the Target Lock, the plating readout) and the Wildheart Basin's
// alert (wildheart_alert_view.ts on the same painter family: the Prey, the
// Stalk, the pollen, the Pack Bond readout). It owns no DOM itself; it
// builds each view from the frame's inputs and hands it to that prompt's
// painter. The frame hands it the world (its entities and roster version):
// the prompts look bodies up by id, and the Foundry alert keeps its scene of
// bosses, drones and floor cells off the roster (foundry_alert_scene_core.ts).

import { type CageEscapeDeps, CageEscapePrompt } from './cage_escape_painter';
import { buildCageEscapeView } from './cage_escape_view';
import { FoundryAlert } from './foundry_alert_painter';
import { FoundryAlertSceneScan, type FoundrySceneEntity } from './foundry_alert_scene_core';
import { buildFoundryAlertView } from './foundry_alert_view';
import { GaolChainAlert } from './gaol_chain_painter';
import { buildGaolChainView, type GaolChainEntity } from './gaol_chain_view';
import { buildWildheartAlertView, WILDHEART_ALERT_KINDS } from './wildheart_alert_view';

export interface DungeonPromptsFrame {
  player: {
    id: number;
    pos: { x: number; z: number };
    auras: readonly {
      id: string;
      sourceId?: number;
      value2?: number;
      remaining?: number;
      duration?: number;
      stacks?: number;
    }[];
    /** The player's target (the Foundry alert reads a plated target). */
    targetId?: number | null;
  };
  /** The world: every body by id, and the roster version (bumped when one
   *  comes or goes). */
  world: {
    entities: ReadonlyMap<number, GaolChainEntity & FoundrySceneEntity>;
    entityRosterVersion: number;
  };
  party: readonly { pid: number }[] | null | undefined;
  /** The interact key's label ('' when unbound). */
  interactKey: string;
  touch: boolean;
}

export class DungeonPrompts {
  private readonly cage: CageEscapePrompt;
  private readonly chain: GaolChainAlert;
  private readonly foundry: FoundryAlert;
  private readonly wildheart: FoundryAlert;
  private readonly foundryScene = new FoundryAlertSceneScan();
  private world: DungeonPromptsFrame['world'] | null = null;
  /** One lookup for every view (no closure a frame). */
  private readonly entity = (id: number) => this.world?.entities.get(id);

  constructor(deps: CageEscapeDeps) {
    this.cage = new CageEscapePrompt(deps);
    this.chain = new GaolChainAlert(deps);
    this.foundry = new FoundryAlert(deps);
    this.wildheart = new FoundryAlert(deps, {
      id: 'wildheart-alert',
      className: 'ui-panel-strong foundry-alert wildheart-alert',
      kinds: WILDHEART_ALERT_KINDS,
    });
  }

  paint(f: DungeonPromptsFrame): void {
    const p = f.player;
    this.world = f.world;
    const entity = this.entity;
    this.cage.paint(
      buildCageEscapeView({
        auras: p.auras,
        cage: entity,
        interactKey: f.interactKey,
        touch: f.touch,
      }),
    );
    this.chain.paint(
      buildGaolChainView({
        selfId: p.id,
        selfPos: p.pos,
        auras: p.auras,
        entity,
        party: f.party,
      }),
    );
    this.foundry.paint(
      buildFoundryAlertView({
        auras: p.auras,
        targetId: p.targetId,
        entity,
        interactKey: f.interactKey,
        touch: f.touch,
        selfId: p.id,
        selfPos: p.pos,
        scene: this.foundryScene.update(f.world),
      }),
    );
    this.wildheart.paint(buildWildheartAlertView({ auras: p.auras, targetId: p.targetId, entity }));
  }

  dispose(): void {
    this.cage.dispose();
    this.chain.dispose();
    this.foundry.dispose();
    this.wildheart.dispose();
  }
}
