import { describe, expect, it, vi } from 'vitest';
import { normalizeSteamTicket, verifySteamAuthTicket } from '../server/steam_auth';

describe('steam auth verification', () => {
  it('normalizes hex tickets and rejects malformed input', () => {
    expect(normalizeSteamTicket(' AABBcc00112233445566778899aabbcc ')).toBe(
      'aabbcc00112233445566778899aabbcc',
    );
    expect(normalizeSteamTicket('not-a-ticket')).toBeNull();
    expect(normalizeSteamTicket('abcd')).toBeNull();
  });

  it('verifies tickets through the Steam Web API with the configured app identity', async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      expect(url.searchParams.get('appid')).toBe('12345');
      expect(url.searchParams.get('identity')).toBe('worldofclaudecraft-test');
      expect(url.searchParams.get('ticket')).toBe('a'.repeat(32));
      return new Response(
        JSON.stringify({
          response: {
            params: {
              steamid: '76561198000000000',
              ownersteamid: '76561198000000000',
              vacbanned: false,
              publisherbanned: false,
            },
          },
        }),
        { status: 200 },
      );
    });

    await expect(
      verifySteamAuthTicket(
        'a'.repeat(32),
        {
          STEAM_APP_ID: '12345',
          STEAM_WEB_API_KEY: 'publisher-key',
          STEAM_AUTH_IDENTITY: 'worldofclaudecraft-test',
        } as NodeJS.ProcessEnv,
        fetchImpl as unknown as typeof fetch,
      ),
    ).resolves.toEqual({
      steamId: '76561198000000000',
      ownerSteamId: '76561198000000000',
      vacBanned: false,
      publisherBanned: false,
    });
  });
});
