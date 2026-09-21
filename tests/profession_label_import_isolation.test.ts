// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

// Fail at the dependency boundary, before a portrait loader can start network
// work that outlives the DOM environment. These painters need only labels.
vi.mock('../src/ui/char_window', () => {
  throw new Error('Profession labels must not import the character window');
});
vi.mock('three', () => {
  throw new Error('Profession painters must not initialize the 3D renderer');
});

describe('profession painter label import isolation', () => {
  it('loads all affected painters without the character window or renderer', async () => {
    const [identity, professions, crafting, training] = await Promise.all([
      import('../src/ui/hud/professions/profession_identity_card'),
      import('../src/ui/hud/professions/professions_window'),
      import('../src/ui/hud/professions/crafting_window'),
      import('../src/ui/hud/vendor/train_window'),
    ]);
    expect(identity.renderProfessionIdentityCard).toBeTypeOf('function');
    expect(professions.ProfessionsWindow).toBeTypeOf('function');
    expect(crafting.renderCraftingWindow).toBeTypeOf('function');
    expect(training.renderTrainWindow).toBeTypeOf('function');
  });
});
