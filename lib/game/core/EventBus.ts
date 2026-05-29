// ============================================================================
// EVENT BUS - Sistema de eventos desacoplado
// ============================================================================
// Reemplaza los callbacks directos entre sistemas.
// Permite: logging, networking hooks, analytics, debugging.
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventMap = Record<string, any>;

export type EventHandler<T = unknown> = (event: T) => void;

export class EventBus<Events extends EventMap = EventMap> {
  private handlers = new Map<string, Set<EventHandler>>();

  on<K extends keyof Events & string>(event: K, handler: EventHandler<Events[K]>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler as EventHandler);
    };
  }

  emit<K extends keyof Events & string>(event: K, data: Events[K]): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (err) {
          console.error(`EventBus error in handler for "${event}":`, err);
        }
      });
    }
  }

  once<K extends keyof Events & string>(event: K, handler: EventHandler<Events[K]>): () => void {
    const wrapper: EventHandler<Events[K]> = (data) => {
      handler(data);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  off<K extends keyof Events & string>(event: K, handler: EventHandler<Events[K]>): void {
    this.handlers.get(event)?.delete(handler as EventHandler);
  }

  removeAll(): void {
    this.handlers.clear();
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

// ============================================================================
// GAME EVENTS - Eventos tipados del juego
// ============================================================================

export interface GameEvents {
  // Entity lifecycle
  'entity:spawned': { entityId: string };
  'entity:despawned': { entityId: string };
  'entity:died': { entityId: string; killerId?: string };

  // Combat
  'entity:damaged': { entityId: string; damage: number; isCrit: boolean; sourceId?: string };
  'entity:healed': { entityId: string; amount: number };
  'combat:started': { attackerId: string; targetId: string };
  'combat:ended': { entityId: string };

  // Movement
  'entity:moved': { entityId: string; x: number; z: number };
  'player:input': { command: import('./GameCommand').GameCommand };

  // Skills
  'skill:cast': { skillId: string; casterId: string; targetId?: string };
  'skill:completed': { skillId: string; casterId: string };

  // Buffs
  'buff:applied': { entityId: string; buffId: string };
  'buff:expired': { entityId: string; buffId: string };

  // Loot
  'loot:dropped': { itemId: string; x: number; z: number; quantity?: number };
  'loot:picked': { entityId: string; itemId: string };

  // Progression
  'level:up': { entityId: string; newLevel: number };
  'job:changed': { entityId: string; newClass: string };

  // Effects (client only)
  'effect:spawn': { type: string; x: number; z: number; scale?: number };
  'effect:float_text': { text: string; color: string; x: number; y: number; z: number };
  'effect:screen_shake': { intensity: number };
  'effect:projectile': { type: string; ownerId: string; targetId: string; damage: number; isCrit: boolean };

  // Audio (client only)
  'audio:play': { action: string };

  // System
  'system:log': { text: string; type: string };
}

// Singleton global para desacoplar sistemas
export const gameEventBus = new EventBus<GameEvents>();
