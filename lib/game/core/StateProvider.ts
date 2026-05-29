import { Entity, CharacterStats, HeadgearId, JobClass, Skill, GroundItem, Projectile } from '../types';

// ============================================================================
// STATE PROVIDER - Abstracción de acceso al state del juego
// ============================================================================
// Permite swap entre LocalState (actual) y NetworkState (futuro).
// Elimina el acoplamiento directo con useGameStore.
// ============================================================================

export interface EntityState {
  entities: Map<string, Entity>;
  projectiles: Projectile[];
  groundItems: GroundItem[];
}

export interface PlayerState {
  entity: Entity;
  stats: CharacterStats;
  jobClass: JobClass;
  headgear: HeadgearId;
  currentHp: number;
  currentSp: number;
  baseExp: number;
  baseMaxExp: number;
  jobExp: number;
  jobMaxExp: number;
  potCount: number;
  skills: Skill[];
}

export interface StateChangeEvent {
  type: 'entity_updated' | 'entity_added' | 'entity_removed' | 'player_updated';
  entityId?: string;
  delta?: Partial<Entity>;
}

export type StateChangeHandler = (event: StateChangeEvent) => void;

export interface StateProvider {
  // Entity queries
  getEntity(id: string): Entity | undefined;
  getEntities(): Entity[];
  getMonsters(): Entity[];
  getNpcs(): Entity[];
  getPlayerEntity(): Entity | undefined;

  // Entity mutations (via events, not direct mutation)
  updateEntity(id: string, delta: Partial<Entity>): void;
  addEntity(entity: Entity): void;
  removeEntity(id: string): void;

  // Projectile queries
  getProjectiles(): Projectile[];
  addProjectile(proj: Projectile): void;
  removeProjectile(id: string): void;

  // Ground items
  getGroundItems(): GroundItem[];
  addGroundItem(item: GroundItem): void;
  removeGroundItem(id: string): void;

  // Player-specific
  getPlayerState(): PlayerState;
  updatePlayerStats(stats: Partial<CharacterStats>): void;
  setPlayerHpSp(hp: number, sp: number): void;

  // Lifecycle
  onStateChange(handler: StateChangeHandler): () => void;
  clear(): void;
}
