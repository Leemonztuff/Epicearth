import { gameEventBus, GameEvents } from '../core/EventBus';
import { Entity, Projectile } from '../types';

// ============================================================================
// EVENT DRIVEN STATE - State management vía eventos
// ============================================================================
// Reemplaza mutaciones directas con eventos tipados.
// Permite: logging, debugging, networking hooks, y testability.
// ============================================================================

export interface EntityStateChange {
  type: 'position' | 'health' | 'state' | 'target' | 'stats';
  entityId: string;
  previous: unknown;
  current: unknown;
  timestamp: number;
}

export class EventDrivenState {
  private changeLog: EntityStateChange[] = [];
  private maxLogSize = 1000;

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Entity position changes
    gameEventBus.on('entity:moved', (event) => {
      this.logChange({
        type: 'position',
        entityId: event.entityId,
        previous: null, // Will be filled by the caller
        current: { x: event.x, z: event.z },
        timestamp: Date.now()
      });
    });

    // Entity damage
    gameEventBus.on('entity:damaged', (event) => {
      this.logChange({
        type: 'health',
        entityId: event.entityId,
        previous: null,
        current: { damage: event.damage, isCrit: event.isCrit },
        timestamp: Date.now()
      });
    });

    // Entity heal
    gameEventBus.on('entity:healed', (event) => {
      this.logChange({
        type: 'health',
        entityId: event.entityId,
        previous: null,
        current: { heal: event.amount },
        timestamp: Date.now()
      });
    });

    // Entity death
    gameEventBus.on('entity:died', (event) => {
      this.logChange({
        type: 'state',
        entityId: event.entityId,
        previous: 'alive',
        current: 'dead',
        timestamp: Date.now()
      });
    });

    // Skill cast
    gameEventBus.on('skill:cast', (event) => {
      this.logChange({
        type: 'state',
        entityId: event.casterId,
        previous: 'idle',
        current: { skill: event.skillId, target: event.targetId },
        timestamp: Date.now()
      });
    });

    // Buff applied
    gameEventBus.on('buff:applied', (event) => {
      this.logChange({
        type: 'stats',
        entityId: event.entityId,
        previous: null,
        current: { buff: event.buffId },
        timestamp: Date.now()
      });
    });

    // Buff expired
    gameEventBus.on('buff:expired', (event) => {
      this.logChange({
        type: 'stats',
        entityId: event.entityId,
        previous: { buff: event.buffId },
        current: null,
        timestamp: Date.now()
      });
    });
  }

  private logChange(change: EntityStateChange): void {
    this.changeLog.push(change);
    if (this.changeLog.length > this.maxLogSize) {
      this.changeLog.shift();
    }
  }

  // --- QUERY METHODS ---

  getChangeLog(): readonly EntityStateChange[] {
    return this.changeLog;
  }

  getChangesForEntity(entityId: string): EntityStateChange[] {
    return this.changeLog.filter(c => c.entityId === entityId);
  }

  getRecentChanges(count: number = 10): EntityStateChange[] {
    return this.changeLog.slice(-count);
  }

  getChangesByType(type: EntityStateChange['type']): EntityStateChange[] {
    return this.changeLog.filter(c => c.type === type);
  }

  // --- STATE TRACKING ---

  private entityStates = new Map<string, { x: number; y: number; z: number; hp: number; state: string }>();

  trackEntity(entity: Entity): void {
    this.entityStates.set(entity.id, {
      x: entity.x,
      y: entity.y,
      z: entity.z,
      hp: entity.currentHp,
      state: entity.state
    });
  }

  getEntityState(entityId: string) {
    return this.entityStates.get(entityId);
  }

  hasEntityChanged(entityId: string, entity: Entity): boolean {
    const tracked = this.entityStates.get(entityId);
    if (!tracked) return true;

    return (
      Math.abs(tracked.x - entity.x) > 0.001 ||
      Math.abs(tracked.y - entity.y) > 0.001 ||
      Math.abs(tracked.z - entity.z) > 0.001 ||
      Math.abs(tracked.hp - entity.currentHp) > 0.1 ||
      tracked.state !== entity.state
    );
  }

  // --- CLEANUP ---

  clear(): void {
    this.changeLog = [];
    this.entityStates.clear();
  }
}

// Singleton para uso global
export const eventDrivenState = new EventDrivenState();
