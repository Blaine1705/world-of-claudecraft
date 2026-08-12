import {
  GENERAL_CHAT_QUOTA_MAX_MESSAGES,
  GENERAL_CHAT_QUOTA_MAX_WINDOW_MINUTES,
  GENERAL_CHAT_QUOTA_MIN_MESSAGES,
  GENERAL_CHAT_QUOTA_MIN_WINDOW_MINUTES,
  GeneralChatQuotaAccountNotFoundError,
  GeneralChatQuotaValidationError,
  type GeneralChatRateLimit,
} from './general_chat_quota_db';

export const GENERAL_CHAT_RATE_LIMIT_REASON_MAX = 500;
export const GENERAL_CHAT_RATE_LIMIT_MESSAGES_MIN = GENERAL_CHAT_QUOTA_MIN_MESSAGES;
export const GENERAL_CHAT_RATE_LIMIT_MESSAGES_MAX = GENERAL_CHAT_QUOTA_MAX_MESSAGES;
export const GENERAL_CHAT_RATE_LIMIT_WINDOW_MINUTES_MIN = GENERAL_CHAT_QUOTA_MIN_WINDOW_MINUTES;
export const GENERAL_CHAT_RATE_LIMIT_WINDOW_MINUTES_MAX = GENERAL_CHAT_QUOTA_MAX_WINDOW_MINUTES;

export const GENERAL_CHAT_RATE_LIMIT_REQUIRED = 'a general chat rate limit or null is required';
export const GENERAL_CHAT_RATE_LIMIT_MESSAGES_INVALID =
  'messages must be an integer from 1 to 1000';
export const GENERAL_CHAT_RATE_LIMIT_WINDOW_INVALID =
  'windowMinutes must be an integer from 1 to 1440';
export const GENERAL_CHAT_RATE_LIMIT_REASON_REQUIRED =
  'a moderation reason is required (500 chars max)';

export interface AdminGeneralChatRateLimitDeps {
  set(input: {
    accountId: number;
    adminAccountId: number;
    rateLimit: GeneralChatRateLimit | null;
    reason: string;
  }): Promise<{
    before: GeneralChatRateLimit | null;
    after: GeneralChatRateLimit | null;
    changed: boolean;
  }>;
}

export type AdminGeneralChatRateLimitOutcome =
  | {
      ok: true;
      value: {
        before: GeneralChatRateLimit | null;
        after: GeneralChatRateLimit | null;
        changed: boolean;
      };
    }
  | { ok: false; status: 400 | 404; error: string };

type ParsedUpdate = { rateLimit: GeneralChatRateLimit | null; reason: string };

function parseBody(body: unknown): ParsedUpdate | string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return GENERAL_CHAT_RATE_LIMIT_REQUIRED;
  }
  const source = body as Record<string, unknown>;
  let parsedRateLimit: GeneralChatRateLimit | null;
  if (source.rateLimit === null) {
    parsedRateLimit = null;
  } else {
    if (
      typeof source.rateLimit !== 'object' ||
      source.rateLimit === null ||
      Array.isArray(source.rateLimit)
    ) {
      return GENERAL_CHAT_RATE_LIMIT_REQUIRED;
    }
    const rateLimit = source.rateLimit as Record<string, unknown>;
    if (
      !Number.isSafeInteger(rateLimit.messages) ||
      (rateLimit.messages as number) < GENERAL_CHAT_RATE_LIMIT_MESSAGES_MIN ||
      (rateLimit.messages as number) > GENERAL_CHAT_RATE_LIMIT_MESSAGES_MAX
    ) {
      return GENERAL_CHAT_RATE_LIMIT_MESSAGES_INVALID;
    }
    if (
      !Number.isSafeInteger(rateLimit.windowMinutes) ||
      (rateLimit.windowMinutes as number) < GENERAL_CHAT_RATE_LIMIT_WINDOW_MINUTES_MIN ||
      (rateLimit.windowMinutes as number) > GENERAL_CHAT_RATE_LIMIT_WINDOW_MINUTES_MAX
    ) {
      return GENERAL_CHAT_RATE_LIMIT_WINDOW_INVALID;
    }
    parsedRateLimit = {
      messages: rateLimit.messages as number,
      windowMinutes: rateLimit.windowMinutes as number,
    };
  }
  const reason = typeof source.reason === 'string' ? source.reason.trim() : '';
  if (!reason || reason.length > GENERAL_CHAT_RATE_LIMIT_REASON_MAX) {
    return GENERAL_CHAT_RATE_LIMIT_REASON_REQUIRED;
  }
  return { rateLimit: parsedRateLimit, reason };
}

export function createAdminGeneralChatRateLimitService(deps: AdminGeneralChatRateLimitDeps) {
  return {
    async update(input: {
      accountId: number;
      adminAccountId: number;
      body: unknown;
    }): Promise<AdminGeneralChatRateLimitOutcome> {
      const parsed = parseBody(input.body);
      if (typeof parsed === 'string') return { ok: false, status: 400, error: parsed };
      try {
        const value = await deps.set({
          accountId: input.accountId,
          adminAccountId: input.adminAccountId,
          ...parsed,
        });
        return { ok: true, value };
      } catch (err) {
        if (err instanceof GeneralChatQuotaValidationError) {
          return { ok: false, status: 400, error: err.message };
        }
        if (err instanceof GeneralChatQuotaAccountNotFoundError) {
          return { ok: false, status: 404, error: 'account not found' };
        }
        throw err;
      }
    },
  };
}

export type AdminGeneralChatRateLimitService = ReturnType<
  typeof createAdminGeneralChatRateLimitService
>;
