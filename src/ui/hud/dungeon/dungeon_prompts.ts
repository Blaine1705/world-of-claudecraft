// The dungeon encounter prompts the HUD composes as ONE member with ONE frame
// call: the Iron Cage escape (cage_escape_*) and Gaoler Ossick's chain alert
// (gaol_chain_*). It owns no DOM itself; it builds each view from the frame's
// inputs and hands it to that prompt's painter.

import { type CageEscapeDeps, CageEscapePrompt } from './cage_escape_painter';
import { buildCageEscapeView } from './cage_escape_view';
import { GaolChainAlert } from './gaol_chain_painter';
import { buildGaolChainView, type GaolChainEntity } from './gaol_chain_view';

export interface DungeonPromptsFrame {
  player: {
    id: number;
    pos: { x: number; z: number };
    auras: readonly { id: string; sourceId?: number; value2?: number }[];
  };
  entity: (id: number) => GaolChainEntity | null | undefined;
  party: readonly { pid: number }[] | null | undefined;
  /** The interact key's label ('' when unbound). */
  interactKey: string;
  touch: boolean;
}

export class DungeonPrompts {
  private readonly cage: CageEscapePrompt;
  private readonly chain: GaolChainAlert;

  constructor(deps: CageEscapeDeps) {
    this.cage = new CageEscapePrompt(deps);
    this.chain = new GaolChainAlert(deps);
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
  }

  dispose(): void {
    this.cage.dispose();
    this.chain.dispose();
  }
}
