// Fixed process/database bounds shared without importing db.ts into the pure
// coordinator or creating a db.ts <-> quota module cycle.
export const GENERAL_CHAT_QUOTA_MAX_IN_FLIGHT = 2;
export const GENERAL_CHAT_QUOTA_DB_POOL_MAX_CLIENTS = GENERAL_CHAT_QUOTA_MAX_IN_FLIGHT;
export const GENERAL_CHAT_QUOTA_LISTENER_CONNECTIONS = 1;
export const GENERAL_CHAT_QUOTA_ACQUIRE_TIMEOUT_MS = 500;
export const GENERAL_CHAT_QUOTA_ADVISORY_NAMESPACE = 1_195_594_577;
