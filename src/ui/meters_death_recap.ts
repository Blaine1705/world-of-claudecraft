// Death Recap rolling buffer and event reconstruction for combat analysis.
// Maintains a bounded ring buffer of recent damage, heal, and absorb events per player,
// latched at death so the player or raid leader can inspect the lethal sequence.

export interface DeathRecapEvent {
  timestamp: number; // ms
  type: 'damage' | 'heal' | 'absorb';
  ability: string;
  sourceName: string;
  sourceId: number;
  amount: number;
  hpBefore?: number;
  hpAfter?: number;
  maxHp?: number;
  lethal?: boolean;
}

export interface DeathRecapRecord {
  pid: number;
  playerName: string;
  deathTime: number; // ms
  killerName?: string;
  killerAbility?: string;
  events: DeathRecapEvent[];
}

export interface DeathRecapRowView {
  timeRel: string; // e.g. "-3.1s" or " 0.0s"
  ability: string;
  sourceName: string;
  amountStr: string; // e.g. "-412" or "+182"
  hpStr: string; // e.g. "210 -> 0 HP"
  lethal: boolean;
  type: 'damage' | 'heal' | 'absorb';
}

export const DEATH_RECAP_BUFFER_CAP = 25;

export class DeathRecapBuffer {
  private readonly buffers = new Map<number, DeathRecapEvent[]>();

  push(pid: number, event: DeathRecapEvent): void {
    let buf = this.buffers.get(pid);
    if (!buf) {
      buf = [];
      this.buffers.set(pid, buf);
    }
    buf.push(event);
    if (buf.length > DEATH_RECAP_BUFFER_CAP) {
      buf.shift();
    }
  }

  getRecentEvents(pid: number): DeathRecapEvent[] {
    return this.buffers.get(pid)?.slice() ?? [];
  }

  clearPlayer(pid: number): void {
    this.buffers.delete(pid);
  }

  clearAll(): void {
    this.buffers.clear();
  }
}

/**
 * Format a DeathRecapRecord into display rows with relative timestamps.
 * Order: chronological (oldest event to lethal event at 0.0s).
 */
export function buildDeathRecapRows(record: DeathRecapRecord): DeathRecapRowView[] {
  const deathTime = record.deathTime;
  const rows: DeathRecapRowView[] = [];

  for (let i = 0; i < record.events.length; i++) {
    const ev = record.events[i];
    const isLast = i === record.events.length - 1;
    const isLethal = ev.lethal === true || (isLast && ev.type === 'damage');
    const diffSec = (ev.timestamp - deathTime) / 1000;
    const timeRel = isLethal || Math.abs(diffSec) < 0.05 ? ' 0.0s' : `${diffSec.toFixed(1)}s`;

    let amountStr = '';
    if (ev.type === 'damage') {
      amountStr = `-${Math.round(ev.amount).toLocaleString()}`;
    } else if (ev.type === 'heal') {
      amountStr = `+${Math.round(ev.amount).toLocaleString()}`;
    } else {
      amountStr = `[${Math.round(ev.amount).toLocaleString()} abs]`;
    }

    let hpStr = '';
    if (ev.hpBefore !== undefined && ev.hpAfter !== undefined) {
      hpStr = `${Math.round(ev.hpBefore)} -> ${Math.round(ev.hpAfter)} HP`;
    } else if (ev.hpAfter !== undefined) {
      hpStr = `${Math.round(ev.hpAfter)} HP`;
    }

    rows.push({
      timeRel,
      ability: ev.ability || 'Attack',
      sourceName: ev.sourceName || 'Unknown',
      amountStr,
      hpStr,
      lethal: isLethal,
      type: ev.type,
    });
  }

  return rows;
}
