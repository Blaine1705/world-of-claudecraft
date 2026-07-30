// @vitest-environment jsdom
import './_setup';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CharacterProfessionsModal from '../../src/admin/components/CharacterProfessionsModal.svelte';
import { t } from '../../src/admin/i18n';
import type { CharacterProfessionsSheet } from '../../src/admin/types';
import { grantPermissions } from './_grant';

const sheet: CharacterProfessionsSheet = {
  characterId: 7,
  name: 'Merlin',
  class: 'mage',
  level: 42,
  accountId: 1,
  username: 'alice',
  live: false,
  updatedAt: '2026-06-01T00:00:00Z',
  archetype: { activeArchetype: 'alchemy', pairedMajor: 'engineering', hobbyCraft: 'cooking' },
  gathering: [
    { professionId: 'mining', proficiency: 42.5 },
    { professionId: 'logging', proficiency: 0 },
    { professionId: 'herbalism', proficiency: 0 },
    { professionId: 'fishing', proficiency: 7 },
  ],
  crafting: [{ craftId: 'alchemy', skill: 30, tier: 1 }],
  knownRecipes: 2,
  slots: [
    {
      professionId: 'mining',
      effectId: 'gatherers_cache',
      durability: 3,
      maxDurability: 16,
      craftedBy: 'Mira',
      confirmMode: 'always',
    },
  ],
  nodeTimers: [
    { nodeId: 'ore_eastbrook_1', zoneId: 'eastbrook_vale', nodeType: 'ore', remainingSeconds: 120 },
  ],
  toolEffectIds: ['gatherers_cache', 'artisans_eye', 'quickening_charm'],
};

const apiGet = vi.fn(async (path: string) => {
  if (path === '/admin/api/characters/7/professions') return sheet;
  throw new Error(`unexpected path ${path}`);
});
const apiPost = vi.fn(async (_path: string, _body: unknown) => ({}));

vi.mock('../../src/admin/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  apiGet: (path: string) => apiGet(path),
  apiPost: (path: string, body: unknown) => apiPost(path, body),
  getToken: () => 'tok',
  getAdminName: () => 'alice',
  clearSession: () => {},
}));

describe('CharacterProfessionsModal', () => {
  beforeEach(() => {
    apiGet.mockClear();
    apiPost.mockClear();
  });

  it('renders proficiencies, slots, and node timers from the sheet', async () => {
    grantPermissions();
    render(CharacterProfessionsModal, {
      props: { characterId: 7, characterName: 'Merlin', onClose: () => {} },
    });
    expect((await screen.findAllByText('mining')).length).toBeGreaterThan(0);
    expect(screen.getByText('42.5')).toBeInTheDocument();
    expect(screen.getAllByText('gatherers_cache').length).toBeGreaterThan(0);
    expect(screen.getByText('Mira')).toBeInTheDocument();
    expect(screen.getByText('ore_eastbrook_1')).toBeInTheDocument();
    // The blob clock is surfaced (this sheet is not live).
    expect(screen.queryByText(t('profInspect.liveBadge'))).not.toBeInTheDocument();
  });

  it('drives the restore-slot flow through the confirm prompt to the endpoint', async () => {
    grantPermissions();
    render(CharacterProfessionsModal, {
      props: { characterId: 7, characterName: 'Merlin', onClose: () => {} },
    });
    await screen.findByText('ore_eastbrook_1');
    // Pick profession + effect, open the prompt, give the reason, confirm.
    const selects = screen.getAllByRole('combobox');
    await fireEvent.change(selects[0], { target: { value: 'mining' } });
    await fireEvent.change(selects[1], { target: { value: 'gatherers_cache' } });
    await fireEvent.click(screen.getByRole('button', { name: t('profInspect.restoreSlotButton') }));
    const reason = screen.getByPlaceholderText(t('detail.notePlaceholder'));
    await fireEvent.input(reason, { target: { value: 'row vanished' } });
    await fireEvent.click(screen.getByRole('button', { name: t('dialog.confirm') }));
    expect(apiPost).toHaveBeenCalledWith('/admin/api/moderation/characters/7/restore-slot', {
      professionId: 'mining',
      effectId: 'gatherers_cache',
      reason: 'row vanished',
    });
  });

  it('drives the restore-item flow to the endpoint with the typed id and count', async () => {
    grantPermissions();
    render(CharacterProfessionsModal, {
      props: { characterId: 7, characterName: 'Merlin', onClose: () => {} },
    });
    await screen.findByText('ore_eastbrook_1');
    const itemInput = screen.getByPlaceholderText('copper_mining_pick');
    await fireEvent.input(itemInput, { target: { value: 'wolf_fang' } });
    await fireEvent.click(screen.getByRole('button', { name: t('profInspect.restoreItemButton') }));
    const reason = screen.getByPlaceholderText(t('detail.notePlaceholder'));
    await fireEvent.input(reason, { target: { value: 'lost to a bug' } });
    await fireEvent.click(screen.getByRole('button', { name: t('dialog.confirm') }));
    expect(apiPost).toHaveBeenCalledWith('/admin/api/moderation/characters/7/restore-item', {
      itemId: 'wolf_fang',
      count: 1,
      reason: 'lost to a bug',
    });
  });

  it('hides the GM restore section without the moderation.act permission', async () => {
    grantPermissions(['accounts.read']);
    render(CharacterProfessionsModal, {
      props: { characterId: 7, characterName: 'Merlin', onClose: () => {} },
    });
    await screen.findByText('ore_eastbrook_1');
    expect(screen.queryByText(t('profInspect.restoreHeader'))).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: t('profInspect.restoreItemButton') }),
    ).not.toBeInTheDocument();
  });
});
