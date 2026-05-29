import { Entity } from '../types';

// ============================================================================
// GAME COMMAND - Command pattern para input del jugador
// ============================================================================
// Cada input del jugador se convierte en un comando serializable.
// Esto permite: buffering, replay, networking, y server validation.
// ============================================================================

export type CommandType = 'move' | 'attack' | 'skill' | 'use_item' | 'interact_npc' | 'cancel_cast';

export interface GameCommand {
  type: CommandType;
  playerId: string;
  sequence: number;
  timestamp: number;
  payload: MovePayload | AttackPayload | SkillPayload | UseItemPayload | NpcInteractPayload | CancelCastPayload;
}

export interface MovePayload {
  x: number;
  z: number;
}

export interface AttackPayload {
  targetId: string;
}

export interface SkillPayload {
  skillId: string;
  targetId?: string;
}

export interface UseItemPayload {
  itemId: string;
}

export interface NpcInteractPayload {
  npcId: string;
  actionParam: string;
}

export interface CancelCastPayload {
  reason: 'movement' | 'damage' | 'manual';
}

// Command queue con buffering
export class CommandQueue {
  private queue: GameCommand[] = [];
  private sequence = 0;
  private maxBufferSize = 30;

  enqueue(type: CommandType, playerId: string, payload: GameCommand['payload']): GameCommand {
    const cmd: GameCommand = {
      type,
      playerId,
      sequence: ++this.sequence,
      timestamp: performance.now(),
      payload
    };

    this.queue.push(cmd);
    if (this.queue.length > this.maxBufferSize) {
      this.queue.shift();
    }

    return cmd;
  }

  dequeue(): GameCommand | undefined {
    return this.queue.shift();
  }

  peek(): GameCommand | undefined {
    return this.queue[0];
  }

  size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }

  getSequence(): number {
    return this.sequence;
  }

  getPending(): readonly GameCommand[] {
    return this.queue;
  }
}
