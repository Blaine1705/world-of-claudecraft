import type { RowPicks } from '../sim/content/talent_rows';
import type { Role, SavedLoadout, TalentAllocation } from '../sim/content/talents';

export interface IWorldTalents {
  // Talents & Specializations. State is server-authoritative; the client stages
  // edits locally and commits via applyTalents (the server re-validates).
  talents: TalentAllocation;
  talentSpec: string | null;
  talentRole: Role | null;
  loadouts: SavedLoadout[];
  activeLoadout: number;
  // Choice-row talents are authoritative world state just like the point tree.
  rowPicks: RowPicks;
  talentPoints(): { total: number; spent: number };
  applyTalents(alloc: TalentAllocation): void;
  respec(): void;
  setSpec(specId: string | null): void;
  pickRowTalent(rowIndex: number, optionId: string | null): void;
  saveLoadout(name: string, bar: (string | null)[], alloc?: TalentAllocation): void;
  switchLoadout(index: number): void;
  deleteLoadout(index: number): void;
}
