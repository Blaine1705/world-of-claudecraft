import type { spawn } from 'node:child_process';

export interface CiLeg {
  name: string;
  cmd: string;
  args: string[];
}

export interface LegResult {
  status: number | null;
  tail: string;
}

export function formatLegHeader(leg: CiLeg): string;

export function runLeg(opts: {
  cmd: string;
  args: string[];
  cwd: string;
  spawnImpl?: typeof spawn;
  out?: { write: (chunk: Buffer) => unknown };
  err?: { write: (chunk: Buffer) => unknown };
  tailBytes?: number;
}): Promise<LegResult>;

export function runLegsWithFlakeRetry(opts: {
  legs: CiLeg[];
  cwd: string;
  log?: (line: string) => unknown;
  error?: (line: string) => unknown;
  runLegImpl?: typeof runLeg;
}): Promise<{ ok: boolean; status: number; retriedLegNames: string[] }>;
