export const DEFAULT_LOCK_FILE_NAME: string;
export const DEFAULT_STALE_MS: number;
export const DEFAULT_POLL_MS: number;
export const DEFAULT_MAX_WAIT_MS: number;
export const DEFAULT_REANNOUNCE_MS: number;

export function isPidAlive(pid: number): boolean;

export function acquireFullSuiteLock(opts?: {
  optOut?: boolean;
  lockDir?: string;
  lockFileName?: string;
  pid?: number;
  now?: () => number;
  staleMs?: number;
  pollMs?: number;
  maxWaitMs?: number;
  reannounceMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
  readFile?: (path: string, encoding: 'utf8') => string;
  writeFile?: (path: string, data: string, opts: { flag: string }) => void;
  unlink?: (path: string) => void;
  isAlive?: (pid: number) => boolean;
}): Promise<{ release: () => void }>;
