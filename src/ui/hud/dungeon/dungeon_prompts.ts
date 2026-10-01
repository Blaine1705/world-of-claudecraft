// The dungeon encounter prompts the HUD composes as ONE member with ONE frame
// call: the Iron Cage escape (cage_escape_*), Gaoler Ossick's chain alert
// (gaol_chain_*) and the Stormbrass Foundry's alert (foundry_alert_*: the
// Storm Cell, the Target Lock, the plating readout). It owns no DOM itself; it
// builds each view from the frame's inputs and hands it to that prompt's
// painter.

import { type CageEscapeDeps, CageEscapePrompt } from './cage_escape_painter';
import { buildCageEscapeView } from './cage_escape_view';
import { FoundryAlert } from './foundry_alert_painter';
import { buildFoundryAlertView, type FoundryAlertEntity } from './foundry_alert_view';
import { GaolChainAlert } from './gaol_chain_painter';
import { buildGaolChainView, type GaolChainEntity } from './gaol_chain_view';

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
  entity: (id: number) => (GaolChainEntity & FoundryAlertEntity) | null | undefined;
  party: readonly { pid: number }[] | null | undefined;
  /** The interact key's label ('' when unbound). */
  interactKey: string;
  touch: boolean;
}

export class DungeonPrompts {
  private readonly cage: CageEscapePrompt;
  private readonly chain: GaolChainAlert;
  private readonly foundry: FoundryAlert;

  constructor(deps: CageEscapeDeps) {
    this.cage = new CageEscapePrompt(deps);
    this.chain = new GaolChainAlert(deps);
    this.foundry = new FoundryAlert(deps);
  }

  paint(f: DungeonPromptsFrame): void {
    const p = f.player;
    this.cage.paint(
      buildCageEscapeView({
        auras: p.auras,
        cage: f.entity,
        interactKey: f.interactKey,
        touch: f.touch,
      }),
    );
    this.chain.paint(
      buildGaolChainView({
        selfId: p.id,
        selfPos: p.pos,
        auras: p.auras,
        entity: f.entity,
        party: f.party,
      }),
    );
    this.foundry.paint(
      buildFoundryAlertView({
        auras: p.auras,
        targetId: p.targetId,
        entity: f.entity,
        interactKey: f.interactKey,
        touch: f.touch,
      }),
    );
  }

  dispose(): void {
    this.cage.dispose();
    this.chain.dispose();
    this.foundry.dispose();
  }
}
