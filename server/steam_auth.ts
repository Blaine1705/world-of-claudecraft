export interface SteamAuthResult {
  steamId: string;
  ownerSteamId: string;
  vacBanned: boolean;
  publisherBanned: boolean;
}

const DEFAULT_STEAM_AUTH_IDENTITY = 'worldofclaudecraft';

function steamAppId(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.STEAM_APP_ID ?? env.VITE_STEAM_APP_ID ?? '';
  const appId = Number(raw);
  return Number.isInteger(appId) && appId > 0 ? appId : 0;
}

function steamApiKey(env: NodeJS.ProcessEnv = process.env): string {
  return (env.STEAM_WEB_API_KEY ?? env.STEAM_PUBLISHER_WEB_API_KEY ?? '').trim();
}

export function steamAuthIdentity(env: NodeJS.ProcessEnv = process.env): string {
  return (
    (env.STEAM_AUTH_IDENTITY ?? DEFAULT_STEAM_AUTH_IDENTITY).trim() || DEFAULT_STEAM_AUTH_IDENTITY
  );
}

export function normalizeSteamTicket(ticket: unknown): string | null {
  if (typeof ticket !== 'string') return null;
  const normalized = ticket.trim().toLowerCase();
  if (!/^[0-9a-f]{32,8192}$/.test(normalized)) return null;
  return normalized;
}

export async function verifySteamAuthTicket(
  ticket: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<SteamAuthResult | null> {
  const appId = steamAppId(env);
  const key = steamApiKey(env);
  if (!appId || !key) throw new Error('steam auth is not configured');

  const url = new URL('https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/');
  url.searchParams.set('key', key);
  url.searchParams.set('appid', String(appId));
  url.searchParams.set('ticket', ticket);
  url.searchParams.set('identity', steamAuthIdentity(env));
  url.searchParams.set('format', 'json');

  const res = await fetchImpl(url, { method: 'GET' });
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok || !data || typeof data !== 'object') return null;
  const params = (data as { response?: { params?: unknown } }).response?.params;
  if (!params || typeof params !== 'object') return null;
  const body = params as Record<string, unknown>;
  const steamId = typeof body.steamid === 'string' ? body.steamid : '';
  if (!/^\d{17}$/.test(steamId)) return null;
  return {
    steamId,
    ownerSteamId: typeof body.ownersteamid === 'string' ? body.ownersteamid : steamId,
    vacBanned: Boolean(body.vacbanned),
    publisherBanned: Boolean(body.publisherbanned),
  };
}
