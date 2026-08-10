// The spawn greeting dialog's pure core: the one decision it owns is which
// body copy the greeter speaks (first-character welcome vs refresher), keyed
// off the event's server-recomputed account fact.

import { describe, expect, it } from 'vitest';
import {
  buildTutorialGreetingModel,
  TUTORIAL_GREETER_NPC_ID,
} from '../src/ui/tutorial_greeting_view';

describe('tutorial greeting view', () => {
  it('picks the first-character welcome for a first character', () => {
    const model = buildTutorialGreetingModel(true);
    expect(model.bodyKey).toBe('hudChrome.tutorialGreeting.bodyFirst');
    expect(model.speakerNpcId).toBe(TUTORIAL_GREETER_NPC_ID);
  });

  it('picks the refresher for a later character, buttons unchanged', () => {
    const first = buildTutorialGreetingModel(true);
    const later = buildTutorialGreetingModel(false);
    expect(later.bodyKey).toBe('hudChrome.tutorialGreeting.bodyRefresher');
    expect(later.bodyKey).not.toBe(first.bodyKey);
    expect(later.playKey).toBe(first.playKey);
    expect(later.skipKey).toBe(first.skipKey);
  });
});
