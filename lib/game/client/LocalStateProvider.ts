import { Entity, Projectile, GroundItem, CharacterStats } from '../types';
import { StateProvider, StateChangeHandler, StateChangeEvent } from '../core/StateProvider';

export interface LocalStateProviderInit {
  getPlayerEntity: () => Entity;
  getMonsters: () => readonly Entity[];
  getNpcs: () => readonly Entity[];
  getProjectiles: () => readonly Projectile[];
  getGroundItems: () => readonly GroundItem[];
  store: {
    getStats(): CharacterStats;
    setPlayerHpSp(hp: number, sp: number): void;
    updateStats(stats: Partial<CharacterStats>): void;
  };
}

export class LocalStateProvider implements StateProvider {
  private changeHandlers: StateChangeHandler[] = [];
  private state: LocalStateProviderInit | null = null;

  init(state: LocalStateProviderInit): void {
    this.state = state;
  }

  getEntity(id: string): Entity | undefined {
    if (!this.state) return undefined;
    if (this.state.getPlayerEntity().id === id) return this.state.getPlayerEntity();
    return [...this.state.getMonsters(), ...this.state.getNpcs()].find(e => e.id === id);
  }

  getEntities(): Entity[] {
    if (!this.state) return [];
    return [this.state.getPlayerEntity(), ...this.state.getMonsters(), ...this.state.getNpcs()];
  }

  getMonsters(): Entity[] {
    return this.state?.getMonsters() as Entity[] || [];
  }

  getNpcs(): Entity[] {
    return this.state?.getNpcs() as Entity[] || [];
  }

  getPlayerEntity(): Entity | undefined {
    return this.state?.getPlayerEntity();
  }

  updateEntity(id: string, delta: Partial<Entity>): void {
    this.emitChange({ type: 'entity_updated', entityId: id, delta });
  }

  addEntity(entity: Entity): void {
    this.emitChange({ type: 'entity_added', entityId: entity.id });
  }

  removeEntity(id: string): void {
    this.emitChange({ type: 'entity_removed', entityId: id });
  }

  getProjectiles(): Projectile[] {
    return this.state?.getProjectiles() as Projectile[] || [];
  }

  addProjectile(_proj: Projectile): void {
    // Handled by ProjectileSystem
  }

  removeProjectile(_id: string): void {
    // Handled by ProjectileSystem
  }

  getGroundItems(): GroundItem[] {
    return this.state?.getGroundItems() as GroundItem[] || [];
  }

  addGroundItem(_item: GroundItem): void {
    // Handled by LootSystem
  }

  removeGroundItem(_id: string): void {
    // Handled by LootSystem
  }

  getPlayerState() {
    const s = this.state;
    if (!s) return {} as any;
    const entity = s.getPlayerEntity();
    const stats = s.store.getStats();
    return {
      entity,
      stats,
      jobClass: (entity as any)?.job || 'Lord Knight',
      headgear: 'none' as const,
      currentHp: entity.currentHp,
      currentSp: entity.currentSp,
      baseExp: 0,
      baseMaxExp: 0,
      jobExp: 0,
      jobMaxExp: 0,
      potCount: 0,
      skills: []
    };
  }

  updatePlayerStats(stats: Partial<CharacterStats>): void {
    this.state?.store.updateStats(stats);
  }

  setPlayerHpSp(hp: number, sp: number): void {
    this.state?.store.setPlayerHpSp(hp, sp);
  }

  onStateChange(handler: StateChangeHandler): () => void {
    this.changeHandlers.push(handler);
    return () => {
      this.changeHandlers = this.changeHandlers.filter(h => h !== handler);
    };
  }

  clear(): void {
    this.changeHandlers = [];
    this.state = null;
  }

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
