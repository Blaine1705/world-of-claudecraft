// The char-select "Redesign" editor: a character's one-shot appearance change.
//
// Characters with no authored look (everything created before the modular
// creator shipped) carry a single server-tracked redesign token. The editor
// reuses the creation customizer, docked where the news panel sits, and drives
// the shared 3D stage with a DRAFT look; nothing is written anywhere until Save
// posts it and the server burns the token atomically. Cancel — or navigating
// away, or a roster refresh — discards the draft and the character keeps the
// design it had.
//
// Its own module rather than more top-level functions in the app coordinator:
// this is a self-contained screen, it needs none of the coordinator's private
// mutable state, and everything it does need arrives through RedesignEditorDeps.
// That also makes the two decisions worth testing (what the stage is driven
// with, and when the token is actually spent) reachable from a Vitest with a
// fake host instead of only by clicking.

import {
  type ArmorLoadout,
  classArmorSet,
  fullSet,
  type ModularAppearance,
  normalizeAppearance,
} from '../render/characters/modular';
import type { RosterLookRow } from '../render/characters/player_look_core';
import type { PlayerClass } from '../sim/types';
import { type AppearanceCustomizer, mountAppearanceCustomizer } from './appearance_customizer';
import { forgetAppearancePanel, noteAppearancePanelMounted } from './appearance_panel_locale';
import { t } from './i18n';

/** The roster row the editor works against. Structural (the char-select
 *  `CharacterSummary` satisfies it) so this module does not import the net
 *  layer for a type. */
export interface RedesignTarget extends RosterLookRow {
  id: number;
  name: string;
  mainhandItemId?: string | null;
  offhandItemId?: string | null;
  weaponSkinId?: string | null;
}

/** Everything the editor needs from the app coordinator. All of it is either a
 *  singleton it must not own (the 3D stage, the api client) or a screen-level
 *  action it must not perform itself (re-pulling the roster). */
export interface RedesignEditorDeps {
  /** Drive the shared char-select turntable with a draft look. */
  previewModular(
    app: ModularAppearance,
    worn: ArmorLoadout,
    cls: PlayerClass,
    mainhandItemId: string | null,
    offhandItemId: string | null,
    weaponSkinId: string | null,
  ): void;
  /** Put the stage back on whatever the roster selection is (Cancel). */
  restoreStage(): void;
  /** The name shown under the stage. */
  setPreviewName(name: string): void;
  /** POST the redesign. Rejects on a spent token or a malformed look. */
  saveAppearance(characterId: number, app: ModularAppearance, helmHidden: boolean): Promise<void>;
  /** Re-pull the roster after a successful save. */
  refreshRoster(): Promise<void>;
  /** Map a rejected save to a sentence a player can read. */
  errorText(err: unknown): string;
}

/** The panel id the locale probe tracks this editor's customizer under. */
const PANEL_ID = '#charselect-reroll';

export class CharselectRedesignEditor {
  private target: RedesignTarget | null = null;
  private draft: ModularAppearance | null = null;
  private ui: AppearanceCustomizer | null = null;
  /** The editor's helmet toggle. Unlike the creation turntable's preview flag,
   *  this IS saved: it is the character's standing wardrobe preference, the same
   *  thing creation posts and the in-world paperdoll eye edits.
   *
   *  Which is exactly why it is SEEDED FROM THE CHARACTER rather than forced
   *  open. It used to start hidden on every open, on the reasoning that a face
   *  you are authoring should be visible — fine while the toggle was a preview,
   *  wrong the moment it became a preference: a player who had never hidden
   *  anything, redesigned, and never touched the row came out with their helm
   *  hidden. Save is now a no-op on this field unless they move it. */
  private helmHidden = false;

  constructor(private readonly deps: RedesignEditorDeps) {}

  /** Whether a redesign is in progress, i.e. whether the stage belongs to a
   *  draft rather than to the roster selection. */
  get isOpen(): boolean {
    return this.target !== null && this.draft !== null;
  }

  /** The kit the draft is previewed over: the class set, head piece dropped
   *  while the helm is hidden. */
  private loadout(c: RedesignTarget): ArmorLoadout {
    const full = fullSet(classArmorSet(c.class));
    return this.helmHidden ? { ...full, head: null } : full;
  }

  /** Push the current draft onto the 3D stage. Safe to call at any time; a
   *  no-op when no redesign is open, which is what lets the coordinator route
   *  every stage refresh through it. */
  drivePreview(): void {
    const c = this.target;
    const app = this.draft;
    if (!c || !app) return;
    this.deps.previewModular(
      app,
      this.loadout(c),
      c.class,
      c.mainhandItemId ?? null,
      c.offhandItemId ?? null,
      c.weaponSkinId ?? null,
    );
  }

  /** Open the editor on a roster character. Idempotent: opening on a second
   *  character closes the first, discarding its draft. */
  open(c: RedesignTarget): void {
    const panel = document.getElementById('charselect-reroll');
    const host = document.getElementById('charselect-reroll-host');
    if (!panel || !host) return;
    this.close(false);
    this.target = c;
    this.helmHidden = c.helmHidden === true;
    // Seed from the character's stored look; an eligible character has none by
    // definition, so this is the default body until they touch a control.
    this.draft = normalizeAppearance((c.appearance as Partial<ModularAppearance>) ?? null);
    const title = document.getElementById('charselect-reroll-title');
    if (title) title.textContent = t('character.redesignTitle', { name: c.name });
    const errEl = document.getElementById('charselect-reroll-error');
    if (errEl) errEl.textContent = '';
    document.getElementById('charselect-news')?.setAttribute('hidden', '');
    panel.removeAttribute('hidden');
    this.mountCustomizer(host, c);
    this.deps.setPreviewName(c.name);
    this.drivePreview();
  }

  /** Build (or rebuild) the customizer against the CURRENT locale. Separate
   *  from open() because a language switch while the editor is up has to
   *  re-mount it: the customizer bakes its labels and cannot relabel in place
   *  (see appearance_panel_locale). */
  private mountCustomizer(host: HTMLElement, c: RedesignTarget): void {
    this.ui?.destroy();
    this.ui = mountAppearanceCustomizer(host, {
      value: this.draft,
      onChange: (next) => {
        this.draft = next;
        this.drivePreview();
      },
      helm: !this.helmHidden,
      onHelm: (on) => {
        this.helmHidden = !on;
        this.drivePreview();
      },
      armorSet: () => classArmorSet(c.class),
    });
    noteAppearancePanelMounted(PANEL_ID, () => {
      const stillHosted = document.getElementById('charselect-reroll-host');
      if (this.target === c && stillHosted) this.mountCustomizer(stillHosted, c);
    });
  }

  /** Discard the draft and hide the panel. `restoreStage` puts the turntable
   *  back on the roster selection; pass false when the caller is about to drive
   *  the stage itself (a save, or a roster refresh that will re-select). */
  close(restoreStage: boolean): void {
    this.ui?.destroy();
    this.ui = null;
    forgetAppearancePanel(PANEL_ID);
    this.target = null;
    this.draft = null;
    document.getElementById('charselect-reroll')?.setAttribute('hidden', '');
    document.getElementById('charselect-news')?.removeAttribute('hidden');
    if (restoreStage) this.deps.restoreStage();
  }

  /** Spend the token. The server decides eligibility and burns it atomically,
   *  so a rejection here leaves the editor open with its draft intact and the
   *  character unchanged. */
  async save(): Promise<void> {
    const c = this.target;
    const draft = this.draft;
    if (!c || !draft) return;
    const saveBtn = document.getElementById('btn-reroll-save') as HTMLButtonElement | null;
    const errEl = document.getElementById('charselect-reroll-error');
    if (saveBtn) saveBtn.disabled = true;
    if (errEl) errEl.textContent = '';
    try {
      await this.deps.saveAppearance(c.id, draft, this.helmHidden);
      this.close(false);
      // Re-pull the roster: the row redraws with the new look, and the spent
      // token (server truth) removes the Redesign button.
      await this.deps.refreshRoster();
    } catch (err) {
      if (errEl) errEl.textContent = this.deps.errorText(err);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }
}
