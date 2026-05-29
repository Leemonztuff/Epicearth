import { Entity, Projectile, GroundItem, CharacterStats, HeadgearId, JobClass, Skill } from '../types';
import { useGameStore } from '../state';
import { StateProvider, StateChangeHandler, StateChangeEvent } from '../core/StateProvider';

// ============================================================================
// LOCAL STATE PROVIDER - Implementación local del StateProvider
// ============================================================================
// Implementa la interfaz StateProvider usando useGameStore (Zustand).
// Esta es la implementación para single-player / client-side prediction.
// Futura implementación: NetworkStateProvider (recibe snapshots del servidor).
// ============================================================================

export class LocalStateProvider implements StateProvider {
  private changeHandlers: StateChangeHandler[] = [];

  // --- Entity Queries ---

  getEntity(id: string): Entity | undefined {
    // Para entidades del mundo, necesitamos acceso al engine
    // Por ahora retornamos undefined - será implementado con worldRuntime
    return undefined;
  }

  getEntities(): Entity[] {
    return [];
  }

  getMonsters(): Entity[] {
    return [];
  }

  getNpcs(): Entity[] {
    return [];
  }

  getPlayerEntity(): Entity | undefined {
    // El player entity se maneja en engine.ts por ahora
    return undefined;
  }

  // --- Entity Mutations (via events) ---

  updateEntity(id: string, delta: Partial<Entity>): void {
    this.emitChange({ type: 'entity_updated', entityId: id, delta });
  }

  addEntity(entity: Entity): void {
    this.emitChange({ type: 'entity_added', entityId: entity.id });
  }

  removeEntity(id: string): void {
    this.emitChange({ type: 'entity_removed', entityId: id });
  }

  // --- Projectile Queries ---

  getProjectiles(): Projectile[] {
    return [];
  }

  addProjectile(proj: Projectile): void {
    // Será implementado con worldRuntime
  }

  removeProjectile(id: string): void {
    // Será implementado con worldRuntime
  }

  // --- Ground Items ---

  getGroundItems(): GroundItem[] {
    return [];
  }

  addGroundItem(item: GroundItem): void {
    // Será implementado con worldRuntime
  }

  removeGroundItem(id: string): void {
    // Será implementado con worldRuntime
  }

  // --- Player-specific ---

  getPlayerState() {
    const store = useGameStore.getState();
    return {
      entity: {} as Entity, // Será inyectado desde engine
      stats: store.stats,
      jobClass: store.jobClass,
      headgear: store.headgear,
      currentHp: store.currentHp,
      currentSp: store.currentSp,
      baseExp: store.playerBaseExp,
      baseMaxExp: store.playerBaseMaxExp,
      jobExp: store.playerJobExp,
      jobMaxExp: store.playerJobMaxExp,
      potCount: store.potCount,
      skills: store.skills
    };
  }

  updatePlayerStats(stats: Partial<CharacterStats>): void {
    useGameStore.getState().updateStats(stats);
  }

  setPlayerHpSp(hp: number, sp: number): void {
    useGameStore.getState().setPlayerHpSp(hp, sp);
  }

  // --- Lifecycle ---

  onStateChange(handler: StateChangeHandler): () => void {
    this.changeHandlers.push(handler);
    return () => {
      this.changeHandlers = this.changeHandlers.filter(h => h !== handler);
    };
  }

  clear(): void {
    this.changeHandlers = [];
  }

  // --- Internal ---

  private emitChange(event: StateChangeEvent): void {
    this.changeHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (err) {
        console.error('StateProvider change handler error:', err);
      }
    });
  }
}
