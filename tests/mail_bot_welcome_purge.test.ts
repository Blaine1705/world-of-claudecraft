// The bot welcome letter purge (issue #3560): the pure book transform behind
// scripts/migrate_mail_bot_welcome_purge.ts. A ravenpost_welcome letter
// survives only when its recipient resolves to a real character, by the
// (id, current name) pair or the legacy name-key; everything that is not a
// welcome letter is untouchable regardless of addressee.

import { describe, expect, it } from 'vitest';
import {
  type CharacterRow,
  type MailLetterLike,
  purgeBotWelcomeLetters,
  WELCOME_LETTER_ID,
} from '../scripts/mail_bot_welcome_purge_migration';

const CHARACTERS: CharacterRow[] = [
  { id: 10774, name: 'PhoneBoy' },
  { id: 20001, name: 'Old Hobb' },
];

function welcome(recipientKey: string, recipientName: string): MailLetterLike {
  return { id: 1, letterId: WELCOME_LETTER_ID, kind: 'system', recipientKey, recipientName };
}

describe('purgeBotWelcomeLetters', () => {
  it('removes a welcome letter addressed to a reaped bot pid', () => {
    const book = { mail: [welcome('987654', 'Reeve Marlow')], nextMailId: 5 };
    const result = purgeBotWelcomeLetters(book, CHARACTERS);
    expect(result.changed).toBe(true);
    expect(result.removed).toBe(1);
    expect((result.value.mail as unknown[]).length).toBe(0);
    // The rest of the book shape rides along unchanged.
    expect(result.value.nextMailId).toBe(5);
  });

  it('keeps a real character welcome letter (id and current name match)', () => {
    const book = { mail: [welcome('10774', 'PhoneBoy')] };
    const result = purgeBotWelcomeLetters(book, CHARACTERS);
    expect(result.changed).toBe(false);
    expect(result.kept).toBe(1);
    expect(result.value).toBe(book);
  });

  it('removes a bot letter whose pid collides with a real character id', () => {
    // The bot letter is keyed to character 10774 but carries the bot roster
    // name, so the pair mismatch identifies it even though the key is live.
    const book = { mail: [welcome('10774', 'Tally Cooper'), welcome('10774', 'PhoneBoy')] };
    const result = purgeBotWelcomeLetters(book, CHARACTERS);
    expect(result.removed).toBe(1);
    expect((result.value.mail as MailLetterLike[])[0].recipientName).toBe('PhoneBoy');
  });

  it('keeps a legacy name-keyed welcome letter', () => {
    const book = { mail: [welcome('PhoneBoy', 'PhoneBoy')] };
    const result = purgeBotWelcomeLetters(book, CHARACTERS);
    expect(result.changed).toBe(false);
    expect(result.kept).toBe(1);
  });

  it('keeps a welcome letter for a real character who shares a bot roster name', () => {
    const book = { mail: [welcome('20001', 'Old Hobb')] };
    const result = purgeBotWelcomeLetters(book, CHARACTERS);
    expect(result.changed).toBe(false);
    expect(result.kept).toBe(1);
  });

  it('never touches non-welcome letters, whoever they are addressed to', () => {
    const book = {
      mail: [
        {
          id: 2,
          letterId: 'letter_q_wolves',
          kind: 'npc',
          recipientKey: '555',
          recipientName: 'Gone',
        },
        { id: 3, kind: 'player', recipientKey: '987654', recipientName: 'Reeve Marlow' },
      ],
    };
    const result = purgeBotWelcomeLetters(book, CHARACTERS);
    expect(result.changed).toBe(false);
    expect(result.kept).toBe(2);
  });

  it('handles a malformed book without throwing', () => {
    const result = purgeBotWelcomeLetters({ mail: undefined }, CHARACTERS);
    expect(result.changed).toBe(false);
    expect(result.removed).toBe(0);
  });
});
