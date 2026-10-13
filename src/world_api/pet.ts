import type { PetMode } from '../sim/types';

// The five pet-bar commands (the Ctrl+1..5 binds, and the commands an action-bar
// slot can hold). Routed onto the methods below by src/game/pet_commands.ts.
export type PetCommand = 'attack' | 'taunt' | 'stop' | 'defensive' | 'aggressive';

export interface IWorldPet {
  readonly petSpecialCommandsSupported: boolean;
  abandonPet(): void;
  renamePet(name: string): void;
  revivePet(): void;
  petAttack(): void;
  petTaunt(): void;
  petWaterJet(): void;
  petSpecial(): void;
  setPetAutoTaunt(enabled: boolean): void;
  setPetAutoWaterJet(enabled: boolean): void;
  setPetAutoSpecial(enabled: boolean): void;
  feedPet(itemId: string, target?: { slotIndex: number }): void;
  healPet(): void;
  setPetMode(mode: PetMode): void;
}
